const axios = require('axios')
const { Client, RichEmbed } = require('discord.js')
const os = require('os');
const WebSocket = require('ws');

const settings = require('./settings.json');

const client = new Client();
const ws = new WebSocket(settings.websocket.url);
let botChangedNickname = false;
axios.defaults.headers.common['Authorization'] = `Bearer ${settings.api.key}`;


client.on("ready", () => {
    // All Discord reliant variables need to be initialized here.

    console.log("Attemping Discord Login...");

    client.user.setPresence({
        game: {
            name: "Whack-A-Troll",
            type: "PLAYING"
        },
        status: "online"
    });

    console.log(`Logged in as ${client.user.tag} on ${os.hostname}`);
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    await doGuildMemberUpdate(oldMember, newMember);
})

client.on("guildMemberAdd", member => {
    doGuildMemberAdd(member.user);
})

client.on("message", async message => {
    if (message.channel.name === "remo-admin") {
        await handleAdminMessage(message);
    }
})

client.on("messageDelete", message => {
    doMessageDelete(message);
})

ws.onopen = () => {
    ws.send(JSON.stringify({
        e: 'INTERNAL_LISTENER_AUTHENTICATE',
        d: {
            key: settings.websocket.internal_key
        }
    }));

    ws.send(JSON.stringify({
        e: 'AUTHENTICATE',
        d: {
            token: settings.websocket.token,
            alt: Buffer.from(JSON.stringify({
                userAgent: 'LED Bot RULZ',
                hardwareConcurrency: '42069',
                renderer: 'your mother'
            })).toString('base64')
        }
    }));
    console.log("Logged into Remo");
}

ws.onmessage = async event => {
    const data = JSON.parse(event.data);

    if (data.e === "userAuthenticated") {
        const alt = JSON.parse(Buffer.from(data.d.alt, 'base64').toString());
        const dbUser = await getUserFromDatabase(data.d.username);
        if (!data.d.internalUsernameBanned && dbUser.username_banned) {
            console.log(`${data.d.username} is supposed to be username banned!`)
            ws.send(JSON.stringify({
                e: "INTERNAL_LISTENER_BAN",
                d: {
                    username: data.d.username
                }
            }))
            if (!data.d.internalIpBanned && dbUser.ip_banned) {
                console.log(`${data.d.ip} is supposed to be IP banned!`);
                ws.send(JSON.stringify({
                    e: "INTERNAL_LISTNER_BAN",
                    d: {
                        ip: data.d.ip
                    }
                }))
            }
            if (data.d.internalUsernameBanned && !dbUser.username_banned) {
                updateBannedUser(data.d.username);
            }
            if (data.d.internalIpBanned && !dbUser.ip_banned) {
                updateBannedUser(data.d.ip);
            }
            updateDatabase({
                username: data.d.username,
                gpu: alt.renderer,
                cores: alt.hardwareConcurrency,
                useragent: alt.userAgent,
                ip: data.d.ip,
                username_banned: data.d.internalUsernameBanned,
                ip_banned: data.d.internalIpBanned
            })
        }
    }
}
/**
 * Checks if the member updating has the "DontBeADooDooHead" role, and reverts
 * their nickname if they changed it.
 * @param {GuildMember} oldMember member before update
 * @param {GuildMember} newMember member after update
 * @async
 */
async function doGuildMemberUpdate(oldMember, newMember) {
    if (!botChangedNickname &&
        newMember._roles.indexOf('662719620603576322') >= 0 &&
        oldMember.nickname !== newMember.nickname) {

        console.log("Got unauthed nickname change. Reverting.");
        botChangedNickname = true;
        await newMember.setNickname(oldMember.nickname);
        botChangedNickname = false;
    }
}

/**
 * Send an alert when somebody joins the Discord server.
 * @param {User} user the joining user
 */
function doGuildMemberAdd(user) {
    const embed = new RichEmbed()
        .setTitle("New Discord user Joined")
        .setColor(0x00FFFF)
        .setDescription(
            `${user.username} joined the server.
\`\`\`
tag:        ${user.tag}
ID:         ${user.id}
bot:        ${user.bot}
created:    ${user.createdAt}
\`\`\``);
    client.channels.get('660613570614263819').send(embed);
}

/**
 * Handles bans in the admin channel.
 * @param {Message} message the message
 */
async function handleAdminMessage(message) {
    const content = message.content;

    // Ban events
    if (content.includes("?ban" || content.includes("GGK"))) {
        handleBanEvent(message);
        if (content.startsWith("?ban")) {
            const args = content.slice(settings.prefix.length).split(/ +/);
            if (args[1]) {
                updateBannedUser(args[1]);
            }
        } else if (content.startsWith("?unban")) {
            const args = content.slice(settings.prefix.length).split(/ +/);
            if (args[1]) {
                updateBannedUser(args[1], false);
            }
        }
    }
}

/**
 * Pastes  a deleted message into the skeetbot spam channel
 * @param {Message} message the deleted message
 */
function doMessageDelete(message) {
    const channel = message.channel.name;
    const author = `${message.author.username}#${message.author.discriminator}`;
    const content = message.content;
    const embed = new RichEmbed()
        .setTitle(`Message deleted in #${channel}`)
        .setColor(0x009999)
        .setDescription(`${author}\t${content}`);

    client.channels.get('660613570614263819').send(embed);
}

/**
 * Alerts of a possible banned user or when a ban happens via Discord.
 * @param {Message} message 
 */
function handleBanEvent(message) {
    console.log("got ban message or login, sending to skeetbot channel");
    const embed = new RichEmbed()
        .setTitle("Got Ban Info")
        .setColor(0xFF0000)
        .setDescription(message.content);
    client.channels.get('660613570614263819').send(embed)
}

/**
 * Updates a ban on a username or IP
 * @param {String} target username or IP to ban
 * @param {boolean} ban whether to ban or unban. Default = true. true = ban.
 */
async function updateBannedUser(target, ban = true) {
    console.log("un/banning", target, ban);


    if (target.includes('.')) {
        // IP
        const users = await axios.get(`${settings.api.url}/api/users`).then(res => { // i hate this
            if (res.status === 200) {
                return res.data;
            }
            return [];
        }).catch(err => {
            console.error("ERROR!", err);
            return [];
        })
        for (user of users) { //should really have const or let whicher is appropriate infront to avoid possible issues (for all for of)
            for (ip of user.ip) {
                if (ip === target) {
                    console.log("Found match", target, ip);
                    await axios.put(`${settings.api.url}/api/users/${user}`, { //and this
                        username: user.username,
                        cores: user.cores,
                        gpu: user.gpu,
                        useragent: user.useragent,
                        ip: user.ip,
                        username_banned: user.username_banned,
                        ip_banned: ban,
                        last_seen: user.last_seen
                    }).then(res => {
                        if (res.status === 200) {
                            console.log("Successfully updated user", user.username);
                        } else {
                            console.log("Something went wrong, got response", res.status);
                        }
                    }).catch(err => {
                        console.error("ERROR!", err);
                    })
                }
            }
        }
    } else {
        // Username
        let userFound = false;
        let user = {};
        await axios.get(`${settings.api.url}/api/users/${target}`).then(res => { // and this
            if (res.status === 200) {
                console.log("Got user", target);
                userFound = true;
                user = res.data[0];
            } else {
                console.error("Could not get user", target, res.status);
            }
        })
        if (userFound) {
            console.log(user);
            await axios.put(`${settings.api.url}/api/users/${target}`, {
                username: user.username,
                cores: (isNaN(user.cores) ? 0 : user.cores),
                gpu: user.gpu,
                useragent: user.useragent,
                ip: user.ip,
                username_banned: ban,
                ip_banned: user.ip_banned,
                last_seen: user.last_seen
            }).then(res => {
                if (res.status === 200) {
                    console.log("Successfully updated user", user.username);
                } else {
                    console.log("Something went wrong, got response", res.status);
                }
            }).catch(err => {
                console.error("Error updating banned user", err);
            })
        }
    }
}

/**
 * Updates the last time a user was seen if they exist, otherwise add them to
 * the database.
 * @param {user} user the user to update
 */
async function updateDatabase(user) {
    const lastSeen = new Date();
    const isoString = lastSeen.toISOString();

    //TODO Refactor this so its not so I/O intensive
    const users = await axios.get(`${settings.api.url}/api/users`).then(res => {
        if (res.status === 200) {
            return res.data;
        }
        return [];
    }).catch(err => {
        console.error("could not get users for database update", err);
        return [];
    });

    let seenUser = {};
    let seen = false;
    for (tmpUser of users) { //slightly uggo
        if (user.username === tmpUser.username) {
            seenUser = tmpUser;
            seen = true;
            break;
        }
    }

    if (seen) {
        seenUser.last_seen = isoString;

        if (seenUser.useragent.indexOf(user.useragent) === -1) {//uggo
            seenUser.useragent.push(user.useragent);
        }

        if (seenUser.ip.indexOf(user.ip) === -1) {//uggo
            seenUser.ip.push(ip);
        }


        checkIfBanned(user, users);
        await axios.put(`${settings.api.url}/api/users/${user.username}`,
            {
                username: seenUser.username,
                cores: seenUser.cores,
                gpu: seenUser.gpu,
                ip: seenUser.ip,
                ip_banned: seenUser.ip_banned,
                last_seen: seenUser.last_seen,
                username_banned: seenUser.username_banned,
                useragent: seenUser.useragent
            }).then(res => {
                if (res.status === 200) {
                    console.log("Successfully updated user", user.username);
                }
            }).catch(err => {
                console.error("Error updating seen user", err);
            });

    } else {
        await axios.post(`${settings.api.url}/api/users/`, {
            username: user.username,
            cores: user.cores,
            gpu: user.gpu,
            useragent: user.useragent,
            ip: user.ip,
            username_banned: user.username_banned,
            ip_banned: user.ip_banned,
            last_seen: isoString
        }).then(res => {
            if (res.status === 200) {
                console.log("Successfully added new user", user.username);
                client.channels.get('640601815754473504').send(`Hey! ${user.username} isn't in my database!`)
                client.channels.get('660613570614263819').send(`New user\n\n${user}`)
            }
        })
    }
}

/**
 * Tests if a user is a possible alt for other banned accounts.
 * @param {user} user The user to test for
 * @param {user[]} users list of users in database
 */
async function checkIfBanned(user, users) {
    console.log(`Checking if ${user.username} is banned...`)
    const targetUser = await getUserFromDatabase(user.username);
    if (targetUser.username_banned && !user.username_banned) {

    }

    let bannedUsers = [];
    for (tmpUser of users) {
        for (ip of targetUser.ip) {
            if (tmpUser.ip.indexOf(ip) >= 0 && (tmpUser.username_banned || tmpUser.ip_banned)) {
                console.log("Got banned account", tmpUser.username, tmpUser.username_banned, tmpUser.ip_banned, tmpUser.ip[0]);
                bannedUsers.push(tmpUser);
            }
        }
    }

    if (bannedUsers.length > 0) {
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
            .setDescription(`${user} may be a possible alt for ${str}`);
        client.channels.get('660613570614263819').send(embed);
    } else {
        console.log("Not banned! :)");
    }
}

/**
 * gets a specific user from the database
 * @param {String} user the username to get
 */
async function getUserFromDatabase(user) {

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
            console.error("Error getting user from database", err);
            result = { error: err };
        })
    return result;
}



client.login(settings.token);