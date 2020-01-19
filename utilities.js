const axios = require('axios');

const settings = require('./settings.json');

const url = `http://${settings.db.server}:${settings.db.port}`;

/**
 * Checks if a user has banned alts
 * @TODO make /banned endpoint in API
 */
module.exports.checkIfBanned = async username => {
    console.log(`Checking if ${username} is banned...`);
    const targetUser = await this.getUserFromDatabase(username); //

    let bannedUsers = []
    try {
        const res = await axios.get(`${url}/banned`)
        bannedUsers = res.data
    } catch(e){
        console.error("Failed to get banned users", err);
    }
    let foundAlt = false;
    if (bannedUsers.length > 0) {
        let str = "\n```";
        for (let user of bannedUsers) {
            if (targetUser.ip === user.ip) {
                str += `${user.username}: ${user.username_banned ? "username" : ""}\t${user.ip_banned ? "ip" : ""}\n`;
                foundAlt = true;
            }
        }
        str += "\n```";
        if (foundAlt) {
            return str;

        } else {
            console.log(`Not banned! :${username === "jill" ? "]" : ")"}`);
            return "";
        }
    } else {
        console.error("Something probably went wrong...");
    }
}

/**
 * Querys the database to see if a connecting user exists. If they exist, their
 * last seen time is updated; otherwise a new user is added to the database.
 * @param {Message.content} content the message content
 * @async
 */
module.exports.dbCheck = async content => {
    const username = content.match(/(?<=\*\*).*(?=\*\*)/)[0];
    let cores = content.match(/(?<=cores: ).*/)[0];
    const gpu = content.match(/(?<=gpu: ).*/)[0];
    const useragent = content.match(/(?<=user-agent: ).*/)[0];
    const ip = content.match(/(?<=ip: ).*/)[0];
    let usernameBanned = content.match(/(?<=usernameBanned: ).*/)[0];
    let ipBanned = content.match(/(?<=ipBanned: ).*/)[0];
    const lastSeen = new Date();
    const isoString = lastSeen.toISOString();

    cores = (isNaN(cores) ? 0 : cores);
    usernameBanned = (usernameBanned === "true" ? true : false);
    ipBanned = (ipBanned === "true" ? true : false);

    const users = await axios.get(`${url}/users`).then(res => {
        if (res.status === 200) {
            return res.data;
        }
        return [];
    }).catch(err => {
        console.error(err);
    });

    let seen = false;
    for (user of users) {
        if (user.username === username) {
            seen = true;
            break;
        }
    }

    if (seen) {
        // Update the last time they were seen
        axios.put(`${url}/users/${username}`, {
            username: username,
            cores: cores,
            gpu: gpu,
            useragent: useragent,
            ip: ip,
            username_banned: usernameBanned,
            ip_banned: ipBanned,
            lastSeen: isoString
        }).then(res => {
            if (res.status === 200) {
                console.log(`Successfully updated user ${username}`);
                // this.checkIfBanned(username);
            }
        }).catch(err => {
            console.error(err);
        });
    } else {
        // Add a new entry to the database
        axios.post(`${url}/users`, {
            username: username,
            cores: cores,
            gpu: gpu,
            useragent: useragent,
            ip: ip,
            username_banned: usernameBanned,
            ip_banned: ipBanned,
            last_seen: isoString
        }).then(res => {
            if (res.status === 201) {
                console.log(`Successfully updated user ${username}`);
            }
        }).catch(err => {
            console.error(err);
        })
    }
}

/**
 * Gets the last time a user was seen
 * @param {String} user the remo user to query
 * @async
 * @returns last time a remo user was seen in UTC (MM/DD/YYYY HH:mm UTC)
 */
module.exports.getLastSeen = async user => {
    console.log("Trying to get last seen time for user:", user);
    const userObj = await this.getUserFromDatabase(user);
    if (!userObj.error) {
        const lastSeen = new Date(userObj.last_seen);

        const lastSeenDate = `${lastSeen.getUTCMonth() + 1}/${lastSeen.getUTCDate()}/${lastSeen.getUTCFullYear()}`
        const lastSeenTime = `${lastSeen.getUTCHours()}:` + (lastSeen.getMinutes() < 10 ? `0${lastSeen.getUTCMinutes()}` : `${lastSeen.getUTCMinutes()}`)

        return `${lastSeenDate} ${lastSeenTime} UTC`;
    } else {
        return userObj.error;
    }
}

/**
 * Gets a user from the database if it exists.
 * @param {String} user the name of the user to check
 * @example
 *      const targetUser = await getUserFromDatabase(username);
 * 
 * @returns {Object} a user object with information gotten from the database
 */
module.exports.getUserFromDatabase = async username => {
    console.log(`Trying to get ${username} from the database...`);
    
    let result = "";
    /*await axios.get(`${url}/users/${username}`)
        .then(res => {
            if (!res.data[0]) {
                console.log("Found no users in database with matching username:", username);
                result = { error: "Not found" };
            } else {
                console.log("Found username:", res.data[0].username);
                result = res.data[0];
            }
        }).catch(err => {
            console.error(err);
            result = { error: err };
        });
    */

    try {  
        const res = await axios.get(`${url}/users/${username}`)

        if (!res.data[0]) {
            console.log("Found no users in database with matching username:", username);
            result = { error: "Not found" };
        } else {
            console.log("Found username:", res.data[0].username);
            result = res.data[0];
        }
    } catch(e){
        console.error(err);
        result = { error: err };
    }

    return result;
}

/**
 * Looks for accounts to update if a ban has been issued. Updates ban statuses
 * accordingly.
 * @param {String} target 
 * @async
 */
module.exports.updateBannedUser = async target => {
    console.log(`Updating bans on ${target}...`);

    console.log("Getting list of users to check for bannable accounts...");
    const users = await axios.get(`${url}/users`)
        .then(res => {
            if (res.status === 200) {
                return res.data;
            }
            return [];
        }).catch(err => {
            console.error(err.data);
        })

    if (target.includes('.')) {
        // IP
        console.log("Running IP match...")
        for (let i = 0; i < users.length; i++) {
            if (users[i].ip === target) {
                console.log("Found match:", users[i].ip, target);
                axios.put(`${url}/users/${users[i].username}`, {
                    username: users[i].username,
                    cores: users[i].cores,
                    gpu: users[i].gpu,
                    useragent: users[i].useragent,
                    ip: users[i].ip,
                    username_banned: users[i].username_banned,
                    ip_banned: true,
                    last_seen: users[i].last_seen
                }).then(res => {
                    if (res.status === 200) {
                        console.log("Successfully updated user:", users[i].username);
                    } else {
                        console.log("Failed to update user!");
                        console.error("Got unexpected result:", res);
                    }
                }).catch(err => {
                    console.log("Failed to update user!");
                    console.error(err.data);
                })
            }
        }
    } else {
        // Username
        console.log("Running username match...");
        const user = await this.getUserFromDatabase(target);
        await axios.put(`${url}/users/${user.username}`, {
            username: users[i].username,
            cores: users[i].cores,
            gpu: users[i].gpu,
            useragent: users[i].useragent,
            ip: users[i].ip,
            username_banned: true,
            ip_banned: users[i].ip_banned,
            last_seen: users[i].last_seen
        }).then(res => {
            if (res.status === 200) {
                console.log("Successfully updated user:", users[i].username);
            } else {
                console.log("Failed to update user!");
                console.error("Got unexpected result:", res);
            }
        }).catch(err => {
            console.log("Failed to update user!");
            console.error(err.data);
        })
    }
}
