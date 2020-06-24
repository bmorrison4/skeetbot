
// IMPORTS >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
const axios = require('axios')
const { Client, RichEmbed, MessageAttachment } = require('discord.js')
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');
// const winston = require('winston');

const settings = require('./settings.json');



// GLOBAL VARIABLES >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
const client = new Client();
const ws = new WebSocket(settings.websocket.url);
let botChangedNickname = false;
axios.defaults.headers.common['Authorization'] = `Bearer ${settings.api.key}`;
const adminChannel = "640601815754473504";
const spamChannel = "660613570614263819";
client.login(settings.token);


// const log = winston.createLogger({
//     level: 'debug',
//     format: winston.format.combine(
//         winston.format.timestamp({
//             format: 'YYYY-MM-DD HH:mm:ss'
//         }),
//         winston.format.errors({ stack: true }),
//         winston.format.splat(),
//         winston.format.json()
//     ),
//     defaultMeta: { service: 'skeetbot-client' },
//     transports: [
//         new winston.transports.File({ filename: 'skeetbot-client-error.log', level: 'error' }),
//         new winston.transports.File({ filename: 'skeetbot-client-combined.log' }),
//         new winston.transports.Console({
//             format: winston.format.combine(
//                 winston.format.colorize(),
//                 winston.format.simple()
//             )
//         })
//     ]
// });

// META >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
/**
 * @typedef {Object} WSUser
 * @property {string} username their remo username
 * @property {string} renderer their GPU string
 * @property {number} cores number of cpu cores
 * @property {string} userAgent their user agent string
 * @property {string} ip their connecting IP
 * @property {boolean} internalUsernameBanned if they are banned via username
 * @property {boolean} internalIpBanned if they are banned via IP
 */
/**
 * @typedef {Object} DBUser
 * @property {string} username their stored username
 * @property {string[]} useragent their tracked useragents
 * @property {number} cores their cpu cores
 * @property {string} gpu their GPU string
 * @property {Date.isoString} last_seen the time they last logged in
 * @property {string[]} ips their tracked ips
 * @property {boolean} username_banned if they've been banned via username
 */
/**
 * @typedef {Object} DBIP 
 * @property {string} ip the stored IP
 * @property {boolean} banned if the IP has been banned
 */

// DISCORD STUFF >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
client.on("ready", () => {
    // All Discord reliant variables need to be initialized here.

    console.warn('Attempting Discord Login...')

    client.user.setPresence({
        game: {
            name: "Whack-A-Troll",
            type: "PLAYING"
        },
        status: "online"
    });

    console.warn(`Logged in as ${client.user.tag} on ${os.hostname}`);
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    await doGuildMemberUpdate(oldMember, newMember);
})

client.on("guildMemberAdd", member => {
    doGuildMemberAdd(member.user);
})

client.on("message", async message => {
    if (message.channel.name === "remo-admin") {
        if (message.content.startsWith(`${settings.prefix}nope`)) {
            const args = message.content.slice(settings.prefix.length).split(/ +/);
            issueBan(args[1]);
        } else if (message.content.startsWith(`${settings.prefix}massban`)) {
            await issueMassBan();
        // } else if (message.content.startsWith(`${settings.prefix}getbanned`)) {
        //     getAllServerBanned();
        // } else if (message.content.startsWith(`${settings.prefix}getchat`)) {
        //     getChatLog(message.content);
        } else {
            await handleAdminMessage(message);
        }
    }
})

client.on("messageDelete", message => {
    doMessageDelete(message);
})


/**
 * Checks if the member updating has the "DontBeADooDooHead" role, and reverts
 * their nickname if they changed it.
 * 
 * @async
 * @param {GuildMember} oldMember member before update
 * @param {GuildMember} newMember member after update
 */
async function doGuildMemberUpdate(oldMember, newMember) {
    if (!botChangedNickname &&
        newMember._roles.indexOf('662719620603576322') >= 0 &&
        oldMember.nickname !== newMember.nickname) {
        console.log('Got unauthed nickname change. Reverting.');
        botChangedNickname = true;
        await newMember.setNickname(oldMember.nickname);
        botChangedNickname = false;
    }
}

/**
 * Send an alert when somebody joins the Discord server.
 * 
 * @param {User} user the joining user
 */
function doGuildMemberAdd(user) {
    console.log('new Discord user joined');
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
    client.channels.get(spamChannel).send(embed);
}

/**
 * Handles bans in the admin channel.
 * 
 * @async
 * @param {Message} message the message
 */
async function handleAdminMessage(message) {
    const content = message.content;

    // Ban events
    if (content.includes("ban")) {
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
 * 
 * @param {Message} message the deleted message
 */
function doMessageDelete(message) {
    console.log('Discord message deleted')
    const channel = message.channel.name;
    const author = `${message.author.username}#${message.author.discriminator}`;
    const content = message.content;
    const embed = new RichEmbed()
        .setTitle(`Message deleted in #${channel}`)
        .setColor(0x009999)
        .setDescription(`${author}\t${content}`);

    client.channels.get(spamChannel).send(embed);
}
/**
 * Alerts of a possible banned user or when a ban happens via Discord.
 * 
 * @param {Message} message 
 */
function handleBanEvent(message) {
    console.log("got ban message or login, sending to skeetbot channel");
    const embed = new RichEmbed()
        .setTitle("Got Ban Info")
        .setColor(0xFF0000)
        .setDescription(message.content);
    client.channels.get(spamChannel).send(embed)
}

/*
    FUCK IT. I'll make it an API thing i guess.
*/
async function getChatLog(message) {
    // const args = message.slice(settings.prefix.length).split(/ +/);
    // if (args.length > 1) {
    //     const date = args[1].split(/\//);
    //     const filename = `chat_${date[0]}_${date[1]}_${date[2]}.tsv`;
    //     const attachment = new MessageAttachment(`/home/brooke/chat_log/${filename}`);
    //     client.channels.get(adminChannel).send(attachment)
    // } else {
    //     const date = new Date(Date.now());
    //     const filename = `chat_${date.getUTCDate() > 10 ? date.getUTCDate() : "0" + date.getUTCDate()}_${date.getUTCMonth() + 1 > 10 ? date.getUTCMonth() + 1 : "0" + (date.getUTCMonth() + 1)}_${date.getUTCFullYear()}.tsv`;
    //     const attachment = new MessageAttachment(`/home/brooke/chat_log/${filename}`);
    //     console.log(attachment);
    //     client.channels.get(adminChannel).send(attachment);
    // }
    client.channels.get(adminChannel).send(`you dummy, Brooke gave up on this.`)
}

// REMO STUFF >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
ws.onopen = () => {
    ws.send(JSON.stringify({
        e: 'INTERNAL_LISTENER_AUTHENTICATE',
        d: {
            key: settings.websocket.internal_key
        }
    }));
    setTimeout(() => {

        ws.send(JSON.stringify({
            e: 'AUTHENTICATE',
            d: {
                token: settings.websocket.token,
                alt: Buffer.from(JSON.stringify({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:74.0) Gecko/20100101 Firefox/74.0',
                    hardwareConcurrency: '12',
                    renderer: 'ANGLE (Radeon RX 5500 XT Direct3D11 vs_5_0 ps_5_0)'
                })).toString('base64')
            }
        }));
    }, 5000);
    console.log("Logged into Remo");
}

ws.onmessage = async event => {
    const data = JSON.parse(event.data);

    if (data.e === "chatMessage") {
        showChatMessage(data.d);
    } else if (data.e === "userAuthenticated") {
        const alt = JSON.parse(Buffer.from(data.d.alt, 'base64').toString());

        if (data.d.username.indexOf("senseal") >= 0) {
            issueBan(data.d.username);
            client.channels.get(adminChannel).send("Got motherfucker, banning.");
        }

        updateDatabase({
            username: data.d.username,
            renderer: alt.renderer,
            hardwareConcurrency: alt.hardwareConcurrency,
            userAgent: alt.userAgent,
            ip: data.d.ip,
            internalUsernameBanned: data.d.internalUsernameBanned,
            internalIpBanned: data.d.internalIpBanned
        })
    } else if (data.e === "INTERNAL_SEND_BANNED") {
        if (data.d) {
            client.channels.get(adminChannel).send(data.d)
        }
    } else if (data.e !== "ROBOT_SERVER_UPDATED") {
        console.log(data)
    }
}

async function showChatMessage(data) {
    const servers = await axios.get("https://remo.tv/api/dev/robot-server/list").then(
        res => {
            return res.data;
        }
    ).catch(err => {
        console.error(err);
        return [];
    })

    let prepend = "";
    for (server of servers) {
        if (server.server_id === data.server_id) {
            prepend = server.server_name;
            break;
        }
    }
    if (prepend === "") prepend = "unlisted/private";

    console.log(`(${prepend}) ${data.username}\t| ${data.message}`);
}

/**
 * Updates a ban on a username or IP
 * 
 * @async
 * @param {String} target username or IP to ban
 * @param {boolean} [ban=true] whether to ban or unban. Default = true. true = ban.
 */
async function updateBannedUser(target, ban = true) {
    console.log("un/banning %s %s", target, ban);


    if (target.includes('.')) {
        // IP
        await axios.put(`${settings.api.url}/api/ips`, {
            ip: target,
            banned: ban
        }).then(res => {
            if (res.status === 200) {
                console.log("IP successfully un/banned: %s %s", target, ban);
            }
        }).catch(err => {
            client.channels.get(spamChannel).send(`Unhandled error in \`updateBannedUser\` \`\`\`${err}\`\`\``)
        })
    } else {
        // Username
        let userFound = false;
        let user = {};
        await axios.get(`${settings.api.url}/api/users/${target}`).then(res => { // and this
            if (res.status === 200) {
                console.log(res.data)
                userFound = true;
                user = res.data[0];
                console.log("Got user %s", user.username);
            } else {
                console.error("Could not get user %s %s", target, res.status);
                client.channels.get(adminChannel).send(`Could not find \`${target}\` in my database (${res.status}).`);

            }
        })
        if (userFound) {
            await axios.put(`${settings.api.url}/api/users/${target}`, {
                username: user.username,
                cores: (isNaN(user.cores) ? 0 : user.cores),
                gpu: user.gpu,
                useragent: user.useragent,
                ips: user.ips,
                username_banned: ban,
                last_seen: user.last_seen
            }).then(res => {
                if (res.status === 200) {
                    console.log("Successfully updated user %s", user.username);
                } else {
                    console.warn("Something went wrong, got response %s", res.status);
                    client.channels.get(adminChannel).send(`Experienced API error whilst updating ban for \`${user.username}\` (${res.status})`)
                }
            }).catch(err => {
                console.error("Error updating banned user %s", err);

            })
        }
    }
}
/**
 * Updates the last time a user was seen if they exist, otherwise add them to
 * the database.
 * 
 * @async
 * @param {WSUser} user the user to update
 */
async function updateDatabase(user) {
    const lastSeen = new Date();
    const isoString = lastSeen.toISOString();
    // console.log(user);

    const dbUser = await getUserFromDatabase(user.username);
    if (dbUser.username) {
        await checkIfBanned(dbUser);
        await banSync(user);
        if (dbUser.useragent.indexOf(user.userAgent) < 0) {
            dbUser.useragent.push(user.userAgent);
        }
        if (dbUser.ips.indexOf(user.ip) < 0) {
            let ipExists = true;
            await axios.get(`${settings.api.url}/api/ip`, { ip: user.ip })
                .then(res => {
                    if (res.data.length === 0 && res.status === 200) {
                        ipExists = false;
                        client.channels.get(adminChannel).send(`${user.ip} is a new IP for ${user.username}`);
                    }
                }).catch(err => {
                    console.error(err);
                    client.channels.get(spamChannel).send("Experienced API error on line 345")
                })
            if (!ipExists) {
                await axios.put(`${settings.api.url}/api/ips`, {
                    ip: user.ip,
                    banned: user.internalIpBanned
                }).then(res => {
                    if (res.status === 200) {
                        console.log("Successfully added ip %s", user.ip)
                    }
                }).catch(err => {
                    console.error(err);
                    client.channels.get(spamChannel).send("Experienced API error on line 356")

                })
            }
            dbUser.ips.push(user.ip)
        }
        dbUser.last_seen = isoString;
        await axios.put(`${settings.api.url}/api/users/${dbUser.username}`,
            {
                username: dbUser.username,
                useragent: dbUser.useragent,
                cores: dbUser.cores,
                gpu: dbUser.gpu,
                last_seen: dbUser.last_seen,
                ips: dbUser.ips,
                username_banned: dbUser.username_banned
            }).then(res => {
                if (res.status === 200) {
                    console.log("Successfully updated user %s", dbUser.username);
                } else {
                    console.error("Something went wrong...%s", res)
                    client.channels.get(adminChannel).send(`Something went wrong trying to update \`${dbUser.username}\` (${res.status})`);
                }
            }).catch(err => {
                console.error(err);
            });
    } else {
        //if not exists:
        //  add new user to the database
        await axios.post(`${settings.api.url}/api/users/`, {
            username: user.username,
            cores: (isNaN(user.hardwareConcurrency) ? 0 : user.hardwareConcurrency),
            // I think an undefined gpu was causing null errors in the API.
            gpu: user.renderer === undefined ? "" : user.renderer,
            useragent: [user.userAgent],
            username_banned: user.internalUsernameBanned,
            ips: [user.ip],
            last_seen: isoString
        }).then(res => {
            if (res.status === 201) {
                console.log("Successfully added user %s", user.username)
            } else {
                client.channels.get(adminChannel).send(`Error adding ${user.username} to my database (${res.status})`)
            }
        }).catch(err => {
            console.error(err);
        });
        //  add new IP to the database
        await axios.post(`${settings.api.url}/api/ips`, {
            ip: user.ip,
            banned: user.internalIpBanned
        }).then(res => {
            if (res.status === 201) {
                console.log("Successfully added IP %s", user.ip);
            } else {
                client.channels.get(adminChannel).send(`Error adding ${user.ip} to my database (${res.status})`);
            }
        }).catch(err => {
            console.error(err);
        });
        client.channels.get(adminChannel).send(`${user.username} doesn't exist in my database!`);
        if (user.internalUsernameBanned || user.internalIpBanned) {
            client.channels.get(spamChannel).send(
                new RichEmbed()
                    .setTitle("New Banned User")
                    .setColor(0x990000)
                    .setDescription(`${user.username} @ ${user.ip}\nuser: ${user.internalUsernameBanned}\nip: ${user.internalIpBanned}`)
            );
        } else {
            const embed = new RichEmbed()
                .setTitle("New Remo User")
                .setColor(0xFFFF00)
                .setDescription(`${user.username} @ ${user.ip}`);
            client.channels.get(spamChannel).send(embed);
        }

    }
}

/**
 * Tests if a user is a possible alt for other banned accounts.
 * 
 * @async
 * @param {DBUser} user The user to test for
 */
async function checkIfBanned(user) {
    console.log(`Checking if ${user.username} is banned...`);
    let bannedUsernames = [];
    await axios.get(`${settings.api.url}/api/bannedusers`)
        .then(res => {
            for (const ip of user.ips) {
                for (const bannedUser of res.data) {
                    for (const ip2 of bannedUser.ips) {
                        if (ip === ip2 &&
                            bannedUsernames.indexOf(bannedUser.username) < 0) {
                            bannedUsernames.push(bannedUser.username);
                        }
                    }
                }
            }
        })

    let bannedIps = [];
    await axios.get(`${settings.api.url}/api/bannedips`)
        .then(res => {
            if (res.status === 200) {
                for (const ip of user.ips) {
                    for (const bannedIp of res.data) {
                        if (ip === bannedIp.ip) {
                            bannedIps.push(ip);
                        }
                    }
                }
            } else {
                client.channels.get(spamChannel).send("Experienced API error on line 468");
            }
        }).catch(err => {
            console.error(err);
        })
    if (bannedUsernames.length > 0 || bannedIps.length > 0) {
        console.log("Found banned usernames or IPs %s %s", bannedUsernames, bannedIps);
        const embed = new RichEmbed()
            .setTitle("Possible alternate account(s)")
            .setColor(0xFF0000)
            .setDescription(
                `**WARNING** ${user.username} is a possible alt!
\`\`\`
${(bannedUsernames.length > 0 ? bannedUsernames : "")}
${(bannedIps.length > 0 ? bannedIps : "")}
\`\`\``
            )
        client.channels.get(spamChannel).send(embed);
        client.channels.get(adminChannel).send(embed);
    } else {
        console.log("Not banned %s", user.username === "jill" ? ":]" : ":)");
    }
}

/**
 * gets a specific user from the database
 * 
 * @async
 * @param {string} user the username to get
 * @example
 * const dbUser = await getUserFromDatabase(user.username);
 * @returns {DBUser | Object[]} the user in the database
 */
async function getUserFromDatabase(user) {

    console.log(`Trying to get ${user} from the database...`)
    let result = "";
    await axios.get(`${settings.api.url}/api/users/${user}`)
        .then(res => {
            if (!res.data[0]) {
                console.log("Found no users in database with matching username %s", user);
                result = [];
            } else {
                console.log("Found username %s", user);
                result = res.data[0];
            }
        }).catch(err => {
            console.error("Error getting user from database", err);
            result = { error: err };
        })
    return result;
}

/**
 * Synchronize the bans for the database and the site.
 * If username banned on the site but not in the database, update the database.
 * If username banned in the database but not on the site, update the site.
 * If IP banned on the site but not in the database, update the database.
 * If IP banned in the database but not on the site, update the site.
 * 
 * @async
 * @param {WSUser} user connecting user
 */
async function banSync(user) {
    console.log("Synchronizing database and website bans...");

    let usernameBanned = false;
    let ipBanned = false;
    await axios.get(`${settings.api.url}/api/users/${user.username}`)
        .then(res => {
            if (res.status === 200) {
                usernameBanned = res.data.username_banned;
            } else {
                client.channels.get(spamChannel).send("encountered API failure on line 547")
            }
        }).catch(err => {
            console.error(err);
            return;
        })
    await axios.get(`${settings.api.url}/api/ip`, { "ip": user.ip })
        .then(res => {
            if (res.status === 200) {
                ipBanned = res.data.banned;
            } else {
                client.channels.get(spamChannel).send("encountered API failure on line 558")
            }
        }).catch(err => {
            console.error(err);
            return;
        })

    if (user.internalUsernameBanned && !usernameBanned) {
        console.log("Database is out of date, updating username ban");
        updateBannedUser(user.username);
    } else if (!user.internalUsernameBanned && usernameBanned) {
        console.log("Website is out of date, issuing username ban.");
        client.channels.get(adminChannel).send(`Website is out of date, issuing ban for ${user.username}`)
        ws.send(JSON.stringify({
            e: "INTERNAL_LISTNER_BAN",
            d: {
                username: user.username
            }
        }))
    }

    if (user.internalIpBanned && !ipBanned) {
        console.log("Database is out of date, updating IP ban");
        updateBannedUser(user.ip);
    } else if (!user.internalIpBanned && ipBanned) {
        console.log("Website is out of date, issuing IP ban.");
        client.channels.get(adminChannel).send(`Website is out of date, issuing ban for ${user.ip}`)
        ws.send(JSON.stringify({
            e: "INTERNAL_LISTNER_BAN",
            d: {
                ip: user.ip
            }
        }))
    }

    if (!usernameBanned && !ipBanned &&
        !user.internalIpBanned && !user.internalUsernameBanned) {
        console.log("No bans to issue or update %s", user.username === "jill" ? ":]" : ":)");
    }

}

async function issueMassBan() {
    const bannedUsers = await axios.get(`${settings.api.url}/api/bannedusers`).then(res => {
        if (res.status === 200) {
            return res.data;
        } else {
            return [];
        }
    }).catch(err => {
        console.error(err);
        return [];
    })
    const bannedIps = await axios.get(`${settings.api.url}/api/bannedips`).then(res => {
        if (res.status === 200) {
            return res.data;
        } else {
            return [];
        }
    }).catch(err => {
        console.error(err);
        return [];
    })

    client.channels.get(adminChannel).send(`Attempting to issue ${bannedUsers.length + bannedIps.length} bans...`);
    try {

        for (let user of bannedUsers) {
            console.log(`Banning ${user.username}`);
            issueBan(user.username);
            await sleep(1000)
        }
        for (let ip of bannedIps) {
            console.log(`Banning ${ip.ip}`);
            issueBan(ip.ip);
            await sleep(1000);
        }
    } catch (e) {
        console.error(e);
        client.channels.get(adminChannel).send("Failed!");
        return;
    }
    client.channels.get(adminChannel).send("Success!");
}

function sleep(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve()
        }, ms)
    })
}

function getAllServerBanned() {
    ws.send(JSON.stringify({
        e: "INTERNAL_SEND_BANNED"
    }))

}

function issueBan(target) {
    if (target.indexOf('.') >= 0) {
        ws.send(JSON.stringify({
            e: "INTERNAL_LISTENER_BAN",
            d: {
                ip: target
            }
        }))
    } else {
        ws.send(JSON.stringify({
            e: "INTERNAL_LISTENER_BAN",
            d: {
                username: target
            }
        }))
    }
    // client.channels.get(adminChannel).send(`Banned ${target}`);
    updateBannedUser(target);
}

