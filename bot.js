const axios = require('axios');
const { Client, RichEmbed } = require('discord.js');
const os = require('os');

const settings = require('./settings.json');

const client = new Client();
// let skeet = {};

/**
 * Runs when the bot is ready. All discord reliant varialbes need to be 
 * initialized here.
 * @async
 */
client.once("ready", async () => {
    // skeet = client.users.get("284468812319817730");

    client.user.setPresence({
        game: {
            name: "for bad guys",
            type: "WATCHING"
        },
        status: "online"
    });

    console.log(`Logged in as ${client.user.tag} on ${os.hostname}`);
});

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
            }
        }
        else if (content.includes("-------------------------------") && message.author.username === "RemoBot") {
            dbCheck(content);
        }
    }
});

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
    const userObj = await getUserFromDatabase(user);
    if (!user.error) {
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
 */
const updateBannedUser = async target => {
    console.log("Target:", target)

    // Get the list of users from the database
    const users = await axios.get(`http://${settings.db.server}:${settings.db.port}/users`).then(res => {
        if (res.status === 200) {
            return res.data;
        }
        return [];
    }).catch(err => {
        console.error(err.data);
    })

    if (target.includes('.')) {
        // IP
        for (let i = 0; i < users.length; i++) {
            if (users[i].ip === target) {
                console.log("Found match", users[i].ip, target)
                axios.put(`http://${settings.db.server}:${settings.db.port}/users/${users[i].username}`, {
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
                        console.log(`Successfully updated user ${users[i].username}`);
                    }
                }).catch(err => {
                    console.log(err.data);
                })
            }
        }
    } else {
        // username

        const user = await getUserFromDatabase(target);
        for (let i = 0; i < users.length; i++) {
            console.log(users[i].ip, user.ip)
            if (users[i].ip === user.ip) {
                console.log("Found match", users[i].username, user.username)
                await axios.put(`http://${settings.db.server}:${settings.db.port}/users/${users[i].username}`, {
                    username: users[i].username,
                    cores: users[i].cores,
                    gpu: users[i].gpu,
                    useragent: users[i].useragent,
                    ip: users[i].ip,
                    username_banned: true,
                    ip_banned: users[i].ip_banned,
                    last_seen: users[i].last_seen
                }).then(res => {
                    console.log('166');
                    if (res.status === 200) {
                        console.log(`Successfully updated user ${users[i].username}`);
                    }
                }).catch(err => {
                    console.log(err.data);
                })
            }
        }
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
    const users = await axios.get(`http://${settings.db.server}:${settings.db.port}/users`).then(res => {
        if (res.status === 200) {
            return res.data;
        }
        return [];
    }).catch(err => {
        console.error(err.data);
    })

    // Boolean flag to see if the target user exists in the database
    let seen = false;
    for (let i = 0; i < users.length; i++) {
        if (users[i].username === username) {
            seen = true;
            i = users.length;
        }

    }

    if (seen) {
        // update the last time they were seen
        axios.put(`http://${settings.db.server}:${settings.db.port}/users/${username}`, {
            username: username,
            cores: cores,
            gpu: gpu,
            useragent: useragent,
            ip: ip,
            username_banned: usernameBanned,
            ip_banned: ipBanned,
            last_seen: isoString
        }).then(res => {
            if (res.status === 200) {
                console.log(`Successfully updated user ${username}`);
                checkIfBanned(username, users);
            }
        }).catch(err => {
            console.log(err.data);
        })
    } else {
        // Add a new entry to the database
        axios.post(`http://${settings.db.server}:${settings.db.port}/users`, {
            username: username,
            cores: cores,
            gpu: gpu,
            useragent: useragent,
            ip: ip,
            username_banned: (usernameBanned === "true" ? true : false),
            ip_banned: (ipBanned === "true" ? true : false),
            last_seen: isoString
        }).then(res => {
            if (res.status === 201) {
                console.log(`Successfully added user ${username}`);
                const embed = new RichEmbed()
                    .setTitle("New Remo user joined")
                    .setColor(0xFF00FF)
                    .setDescription(
                        `Username: ${username}
Cores: ${cores}
GPU: ${gpu}
UA: \`${useragent}\`
IP: ${ip}
Username Banned?: ${usernameBanned}
IP Banned?: ${ipBanned}`);
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
    let result = "";
    await axios.get(`http://${settings.db.server}:${settings.db.port}/users/${user}`)
        .then(res => {
            if (!res.data[0]) {
                console.log("Found no users in database with matching username ", user);
                result = { error: "Not Found" };
            } else {
                console.log("Found username ", user);
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
    const targetUser = await getUserFromDatabase(username);

    for (let i = 0; i < users.length; i++) {
        if (targetUser.ip === users[i].ip && (users[i].username_banned || users[i].ip_banned)) {
            console.log(`Got banned account ${users[i].username}, ${users[i].username_banned}, ${users[i].ip_banned}, ${users[i].ip}`)
            client.channels.get('640601815754473504')
                .send("**WARNING!!!** This Account has connected on an IP that has previously had a banned username or IP.");
        }
    }
}


client.login(settings.token);