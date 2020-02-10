const axios = require('axios');
const { Client, RichEmbed } = require('discord.js');
const os = require('os');

const settings = require('./settings.json');

const client = new Client();
let botChangedNickname = false;

/**
 * Runs when the bot is ready. All discord reliant variables need to be 
 * initialized here.
 * @async
 */
client.once("ready", async () => {
    axios.defaults.headers.common['Authorization'] = `Bearer ${settings.key}`;
    client.user.setPresence({
        game: {
            name: "for bad guys",
            type: "WATCHING"
        },
        status: "online"
    });

    console.log(`Logged in as ${client.user.tag} on ${os.hostname}`);
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (!botChangedNickname &&
        newMember._roles.indexOf('662719620603576322') >= 0 &&
        oldMember.nickname !== newMember.nickname) {
        console.log("Got unauthed nickname change. Reverting.");
        botChangedNickname = true;
        await newMember.setNickname(oldMember.nickname);
        botChangedNickname = false;
    } else if (botChangedNickname) {
        botChangedNickname = false;
    }
})

/**
 * Runs when somebody joins the server.
 * @param {GuildMember} member the member who joined the server
 * @async
 */
client.on("guildMemberAdd", async member => {
    sendJoinMessage(member.user);
});

/**
 * Message event. All chat reliant commands need to be here.
 * @param {Message} message the message that was sent
 * @async
 */
client.on("message", async message => {
    const content = message.content;

    // %info user - where user is a Discord memeber.
    if (content.startsWith(`${settings.prefix}info`)) {
        const target = message.mentions.users.first();
        sendJoinMessage(target);
    }

    // %add user usernameBanned ipBanned - where user is a Remo user,
    // bans are boolean.
    else if (content.startsWith(`${settings.prefix}add`)) {
        // Not yet implemented.
        return;
    }

    // %seen user - where user is a Remo user.
    else if (content.startsWith(`${settings.prefix}seen`)) {
        const args = message.content.slice(settings.prefix.length).split(/ +/);
        if (args[1]) {
            sendLastSeen(message, args[1]);
        } else {
            message.channel.send("You need to specify a Remo user!");
        }
    }

    // %help - send the help dialogue
    else if (content.startsWith(`${settings.prefix}help`)) {
        sendHelpDialogue(message);
    }

    else if (content.startsWith(`${settings.prefix}nick`)) {
        botChangedNickname = true;
        const user = client.users.get(message.mentions.users.first().id);
        if (message.author._roles.indexOf('607300573317824512') >= 0) {
            console.log("resetting nickname for", user.username);
            user.setNickname(user.username);
        } else {
            console.log("insufficent perms to change nick");
        }
    }

    // Non-callable events
    else if (message.channel.name === "remo-admin") {
        // Ban events
        if (content.includes("true") || content.includes("?ban") || content.includes("GGK")) {
            sendMeABanEvent(message);
            if (content.startsWith("?ban")) {
                const args = message.content.slice(settings.prefix.length).split(/ +/);
                if (args[1]) {
                    updateBannedUser(args[1]);
                }
            } else if (content.startsWith("?unban")) {
                const args = message.content.slice(settings.prefix.length).split(/ +/);
                if (args[1]) {
                    updateBannedUser(args[1], false);
                }
            }
        }
        else if (content.includes("-------------------------------") && message.author.username === "RemoBot") {
            dbCheck(content);
        }
    }
});

client.on("messageDelete", async message => {
    const channel = message.channel.name;
    const author = `${message.author.username}#${message.author.discriminator}`;
    const content = message.content;
    const embed = new RichEmbed()
        .setTitle(`Message deleted in #${channel}`)
        .setColor(0x009999)
        .setDescription(
            `${author}: ${content}`
        );
    client.channels.get('660613570614263819').send(embed);
})

/**
 * Send a RichEmbed to #remo-internal when somebody joins the server.
 * 
 * @param {GuildMember} user The joined user
 * @async
 */
const sendJoinMessage = async user => {
    const embed = new RichEmbed()
        .setTitle("New user joined")
        .setColor(0x00FFFF)
        .setDescription(
            `${user.username} joined the server.
\`\`\`
tag:     ${user.tag}
ID:      ${user.id}
bot:     ${user.bot}
created: ${user.createdAt}
\`\`\``);

    client.channels.get('660613570614263819').send(embed);
}

/**
 * Sends the last seen time from the database for a specified user.
 * 
 * @param {Message} message the message that triggered the event
 * @param {string} user the Remo username to get
 * @async
 */
const sendLastSeen = async (message, user) => {
    console.log(`Trying to get ${user}`)
    const userObj = await getUserFromDatabase(user);
    if (!userObj.error) {
        const lastSeen = new Date(userObj.last_seen);

        const lastSeenDate = `${lastSeen.getUTCMonth() + 1}/${lastSeen.getUTCDate()}/${lastSeen.getUTCFullYear()} ${lastSeen.getUTCHours()}:`;
        const lastSeenMinutes = (lastSeen.getMinutes() < 10 ? `0${lastSeen.getMinutes()}` : `${lastSeen.getUTCMinutes()}`);

        message.channel.send(`Last seen: ${lastSeenDate}${lastSeenMinutes} UTC`);
    } else {
        message.channel.send(userObj.error);
    }
}

/**
 * Sends a help dialogue to the channel where the message was called.
 * 
 * @param {Message} message the originating message
 */
const sendHelpDialogue = message => {
    message.channel.send(`\`\`\`
${settings.prefix}info @user    Show a 'new user joined' embed with the tagged user
${settings.prefix}seen user     Shows the last time a Remo user was seen in my database.
${settings.prefix}help          Shows this dialogue.
\`\`\``)
}

/**
 * Sends Me a ban alert any time this is triggered
 * @param {Message} message the originating message
 */
const sendMeABanEvent = message => {
    console.log("got ban message or login, sending to skeetbot channel");
    const embed = new RichEmbed()
        .setTitle("Got Ban Info")
        .setColor(0xFF0000)
        .setDescription(message.content);
    client.channels.get('660613570614263819').send(embed)
}

/**
 * Update a user entry in the database to set their ban flags to true.
 * @param {string} target the target username in the database
 * @param {boolean} ban default true, set false to unban
 */
const updateBannedUser = async (target, ban = true) => {
    console.log("Target:", target)

    // Get the list of users from the database
    const users = await axios.get(`${settings.api.url}/api/users`).then(res => {
        if (res.status === 200) {
            return res.data;
        }
        return [];
    }).catch(err => {
        console.error(err.data);
    })

    if (target.includes('.')) {
        // IP
        /*
        for (let i = 0; i < users.length; i++) {
            if (users[i].ip === target) {
                console.log("Found match", users[i].ip, target)
                axios.put(`${settings.api.url}/api/users/${users[i].username}`, {
                    username: users[i].username,
                    cores: users[i].cores,
                    gpu: users[i].gpu,
                    useragent: users[i].useragent,
                    ip: users[i].ip,
                    username_banned: users[i].username_banned,
                    ip_banned: ban,
                    last_seen: users[i].last_seen
                }).then(res => {
                    if (res.status === 200) {
                        console.log(`Successfully updated user ${users[i].username}`);
                    }
                }).catch(err => {
                    console.log(err.data);
                })
            }
        } 
        */

        for (user of users) {
            for (ip of user.ip) {
                if (ip === target) {
                    console.log("Found match", user.username, ip, target);
                    axios.put(`${settings.api.url}/api/users/${user}`, {
                        username: user.username,
                        cores: user.cores,
                        gpu: user.gpu,
                        useragent: [user.useragent],
                        ip: [user.ip],
                        username_banned: user.username_banned,
                        ip_banned: ban,
                        last_seen: user.last_seen
                    }).then(res => {
                        if (res.status === 200) {
                            console.log(`Successfully updated user ${user.username}`);
                        }
                    }).catch(err => {
                        console.error(err);
                    })
                }
            }
        }
    } else {
        // username

        const user = await getUserFromDatabase(target);

        await axios.put(`${settings.api.url}/api/users/${user.username}`, {
            username: user.username,
            cores: user.cores,
            gpu: user.gpu,
            useragent: [user.useragent],
            ip: [user.ip],
            username_banned: ban,
            ip_banned: user.ip_banned,
            last_seen: user.last_seen
        }).then(res => {
            if (res.status === 200) {
                console.log(`Successfully updated user ${users[i].username}`);
            }
        }).catch(err => {
            console.log(err.data);
        })


    }
}

const dbCheck = async content => {
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

    // Get the list of users from the database
    const users = await axios.get(`${settings.api.url}/api/users`).then(res => {
        if (res.status === 200) {
            return res.data;
        }
        return [];
    }).catch(err => {
        console.error("ERROR!:", err);
        return [];
    })

    // Boolean flag to see if the target user exists in the database
    let seenUser = {};
    let seen = false;
    for (user of users) {
        if (user.username === username) {
            seen = true;
            seenUser = user;
            break;
        }

    }

    if (seen) {

        if (seenUser.useragent.indexOf(useragent) === -1) {
            seenUser.useragent.push(useragent);
        }

        if (seenUser.ip.indexOf(ip) === -1) {
            seenUser.ip.push(ip);
        }

        // check they're banned first
        checkIfBanned(username, users);
        // update the last time they were seen
        axios.put(`${settings.api.url}/api/users/${username}`, {
            username: username,
            cores: cores,
            gpu: gpu,
            useragent: [seenUser.useragent],
            ip: [seenUser.ip],
            username_banned: usernameBanned,
            ip_banned: ipBanned,
            last_seen: isoString
        }).then(res => {
            if (res.status === 200) {
                console.log(`Successfully updated user ${username}`);
            }
        }).catch(err => {
            console.error(err);
        })
    } else {
        // Add a new entry to the database
        axios.post(`${settings.api.url}/api/users`, {
            username: username,
            cores: cores,
            gpu: gpu,
            useragent: [useragent],
            ip: [ip],
            username_banned: (usernameBanned === "true" ? true : false),
            ip_banned: (ipBanned === "true" ? true : false),
            last_seen: isoString
        }).then(res => {
            if (res.status === 201) {
                console.log(`Successfully added user ${username}`);
                const embed = new RichEmbed()
                    .setTitle("New Remo user joined")
                    .setColor(0xFFFF00)
                    //                    .setDescription(
                    //                        `Username: ${username}
                    //Cores: ${cores}
                    //GPU: ${gpu}
                    //UA: \`${useragent}\`
                    //IP: ${ip}
                    //Username Banned?: ${usernameBanned}
                    //IP Banned?: ${ipBanned}`);
                    .setDescription(content);
                client.channels.get('660613570614263819').send(embed);
                client.channels.get('640601815754473504').send("Hey! This user isn't in my database. Are they new?");
            }

        }).catch(err => {
            console.error(err);
        })
    }
}

/**
 * Gets a user entry from the database if it exists.
 * @param {String} user the name of the user to check
 * 
 * @returns {Object} a user object with information gotten from the database
 */
const getUserFromDatabase = async user => {
    console.log(`Trying to get ${user} from the database...`)
    let result = "";
    await axios.get(`${settings.api.url}/api/users/${user}`)
        .then(res => {
            if (!res.data[0]) {
                console.log("Found no users in database with matching username", user);
                result = { error: "Not Found" };
            } else {
                console.log("Found username", user);
                result = res.data[0];
            }
        }).catch(err => {
            console.error(err);
            result = { error: err };
        })
    return result;
}

/**
 * 
 * @param {string} username the username to test if logging in from an IP where 
 * somebody else may have been banned
 * @param {Array[User]} users array of users in database
 */
const checkIfBanned = async (username, users) => {
    console.log(`Checking if ${username} is banned...`)
    const targetUser = await getUserFromDatabase(username);

    let bannedUsers = [];
    // for (let i = 0; i < users.length; i++) {
    //     if (targetUser.ip === users[i].ip && (users[i].username_banned || users[i].ip_banned)) {
    //         console.log(`Got banned account ${users[i].username}, ${users[i].username_banned}, ${users[i].ip_banned}, ${users[i].ip}`)
    //         bannedUsers.push(users[i]);
    //     }
    // }   

    console.log(users.length)
    for (user of users) {
        for (ip of targetUser.ip) {
            if (user.ip.indexOf(ip) >= 0 && (user.username_banned || user.ip_banned)) {
                console.log("Got banned account", user.username, user.username_banned, user.ip_banned, user.ip);
                bannedUsers.push(user);
            }
        }
    }

    if (bannedUsers.length > 0) {
        console.log(bannedUsers);
        let str = "\n```";
        for (let user of bannedUsers) {
            str += `${user.username}: ${user.username_banned ? "username" : ""} ${user.ip_banned ? "ip" : ""}\n`
        }
        str += "\n```";
        client.channels.get('640601815754473504')
            .send(`**WARNING!!!** Banned accounts on IP! Possible alt. ${str}`);
        const embed = new RichEmbed()
            .setTitle('Possible Alternate Account Detected')
            .setColor(0xFF0000)
            .setDescription(`${username} may be a possible alt for ${str}`);
        client.channels.get('660613570614263819').send(embed);
    } else {
        console.log("Not banned! :)");
    }
}


client.login(settings.token);