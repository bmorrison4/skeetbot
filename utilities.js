const axios = require('axios');

const settings = require('./settings.json');

const url = `http://${settings.db.server}:${settings.db.port}`;

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
    await axios.get(`http://${url}/users/${username}`)
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
    return result;
}


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
        const user = await getUserFromDatabase(target);
        for (let i = 0; i < users.length; i++) {
            if (users[i].ip === user.ip) {
                console.log("Found match:", users[i].username, user.username);
                await axios.put(`${url}/users/${users[i].username}`, {
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
    }
}

/**
 * Checks if a user has banned alts
 * @TODO make /banned endpoint in API
 */
module.exports.checkIfBanned = async username => {
    console.log(`Checking if ${username} is banned...`);
    const targetUser = await this.getUserFromDatabase(username);
    const bannedUsers = axios.get(`${url}/banned`).then(res => {
        return res.data;
    }).catch(err => {
        console.error("Failed to get banned users", err);
        return {};
    })

    if (bannedUsers.length > 0) {
        let str = "\n```";
        for (let user of bannedUsers) {
            if (targetUser.ip === user.ip) {
                str += `${user.username}: ${user.username_banned ? "username" : ""}\t${user.ip_banned ? "ip" : ""}\n`;
            }
        }
        str += "\n```";
        return str;
    } else {
        console.log(`Not banned! :${username === "jill" ? "]" : ")"}`);
        return null;
    }
}

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