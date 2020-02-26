
// IMPORTS >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
const axios = require('axios')
const { Client, RichEmbed } = require('discord.js')
const os = require('os');
const WebSocket = require('ws');

const settings = require('./settings.json');

// GLOBAL VARIABLES >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
const client = new Client();
const ws = new WebSocket(settings.websocket.url);
let botChangedNickname = false;
axios.defaults.headers.common['Authorization'] = `Bearer ${settings.api.key}`;

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
        console.log("Got unauthed nickname change. Reverting.");
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
 * 
 * @async
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
 * 
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
 * 
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

// REMO STUFF >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
ws.onopen = () => {
    ws.send(JSON.stringify({
        e: 'INTERNAL_LISTENER_AUTHENTICATE',
        d: {
            key: settings.websocket.internal_key
        }
    }));

    // ws.send(JSON.stringify({
    //     e: 'AUTHENTICATE',
    //     d: {
    //         token: settings.websocket.token,
    //         alt: Buffer.from(JSON.stringify({
    //             userAgent: 'LED Bot RULZ',
    //             hardwareConcurrency: '42069',
    //             renderer: 'your mother'
    //         })).toString('base64')
    //     }
    // }));
    console.log("Logged into Remo");
}

ws.onmessage = async event => {
    const data = JSON.parse(event.data);

    if (data.e === "userAuthenticated") {
        const alt = JSON.parse(Buffer.from(data.d.alt, 'base64').toString());

        updateDatabase({
            username: data.d.username,
            renderer: alt.renderer,
            hardwareConcurrency: alt.hardwareConcurrency,
            userAgent: alt.userAgent,
            ip: data.d.ip,
            internalUsernameBanned: data.d.internalUsernameBanned,
            internalIpBanned: data.d.internalIpBanned
        })
    }
}

/**
 * Updates a ban on a username or IP
 * 
 * @async
 * @param {String} target username or IP to ban
 * @param {boolean} [ban=true] whether to ban or unban. Default = true. true = ban.
 */
async function updateBannedUser(target, ban = true) {
    console.log("un/banning", target, ban);


    if (target.includes('.')) {
        // IP
        await axios.put(`${settings.api.url}/api/ips`, {
            ip: target,
            banned: ban
        }).then(res => {
            if (res.status === 200) {
                console.log("IP successfully un/banned:", target, ban);
            }
        })
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
 * 
 * @async
 * @param {WSUser} user the user to update
 */
async function updateDatabase(user) {
    const lastSeen = new Date();
    const isoString = lastSeen.toISOString();

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
                    console.log(res.data);
                    if (res.data.length === 0 && res.status === 200) {
                        ipExists = false;
                    }
                }).catch(err => {
                    console.error(err);
                })
            if (!ipExists) {
                await axios.put(`${settings.api.url}/api/ips`, {
                    ip: user.ip,
                    banned: user.internalIpBanned
                }).then(res => {
                    if (res.status === 200) {
                        console.log("Successfully added ip", user.ip)
                    }
                }).catch(err => {
                    console.error(err);
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
                    console.log("Successfully updated user", dbUser.username);
                } else {
                    console.error("Something went wrong...", res)
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
            gpu: user.renderer,
            useragent: [user.userAgent],
            username_banned: user.internalUsernameBanned,
            ips: [user.ip],
            last_seen: isoString
        }).then(res => {
            if (res.status === 201) {
                console.log("Successfully added user", user.username)
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
                console.log("Successfully added IP", user.ip);
            }
        }).catch(err => {
            console.error(err);
        });
        client.channels.get('640601815754473504').send(`${user.username} doesn't exist in my database!`);
        const embed = ` **New Remo User**
-------------------------------
**${user.username}**
cores: ${user.hardwareConcurrency}
gpu: ${user.renderer}
user-agent: ${user.userAgent}
ip: ${user.ip}
usernameBanned: ${user.internalUsernameBanned}
ipBanned: ${user.internalIpBanned}
-------------------------------`
        client.channels.get('660613570614263819').send(embed);
    }

    console.log("\n\n");
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
            for (const ip of user.ips) {
                for (const bannedIp of res.data) {
                    if (ip === bannedIp.ip) {
                        bannedIps.push(ip);
                    }
                }
            }
        }).catch(err => {
            console.error(err);
        })
    if (bannedUsernames.length > 0 || bannedIps.length > 0) {
        console.log("Found banned usernames or IPs", bannedUsernames, bannedIps);
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
        client.channels.get('660613570614263819').send(embed);
        client.channels.get('640601815754473504').send(embed);
    } else {
        if (user.username === "jill") {
            console.log("Not banned! :]");
        } else {
            console.log("Not banned! :)");
        }
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
                console.log("Found no users in database with matching username", user);
                result = [];
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
            usernameBanned = res.data.username_banned;
        }).catch(err => {
            console.error(err);
            return;
        })
    await axios.get(`${settings.api.url}/api/ip`, { "ip": user.ip })
        .then(res => {
            ipBanned = res.data.banned;
        }).catch(err => {
            console.error(err);
            return;
        })

    if (user.internalUsernameBanned && !usernameBanned) {
        console.log("Database is out of date, updating username ban");
        updateBannedUser(user.username);
    } else if (!user.internalUsernameBanned && usernameBanned) {
        console.log("Website is out of date, issuing username ban.");
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
        ws.send(JSON.stringify({
            e: "INTERNAL_LISTNER_BAN",
            d: {
                ip: user.ip
            }
        }))
    }

    if (!usernameBanned && !ipBanned &&
        !user.internalIpBanned && !user.internalUsernameBanned) {
        console.log("No bans to issue or update", (user.username === "jill" ? ":]" : ":)"));
    }

}

client.login(settings.token);