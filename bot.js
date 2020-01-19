// Node Modules
const axios = require('axios');
const { Client, RichEmbed } = require('discord.js');
const os = require('os');

// File imports
const utilities = require('./utilities.js');
const settings = require('./settings.json');

// Global variables
let botChangedNickname = false;
const client = new Client();
let spamChannel;
let adminChannel;

/**
 * Runs when the bot is ready. All startup reliant variables should be
 * initialized here.
 * @async
 */
client.once("ready", async () => {
    axios.defaults.headers.common['key'] = settings.key;
    client.user.setPresence({
        game: {
            name: "for bad buys",
            type: "WATCHING"
        },
        status: "online"
    });

    spamChannel = client.channels.get('660613570614263819');
    adminChannel = client.channels.get('640601815754473504');

    console.log(`Logged in as ${client.user.tag} on ${os.hostname}`);
})


/**
 * Runs when somebody joins the server. Sends a message to the spam channel
 * with info about the user who joined
 * @param {GuildMember} member the person who joined the server
 * @async
 */
client.on("guildMemberAdd", async member => {
    console.log("Guild member joined!", member.user.tag);
    const embed = new RichEmbed()
        .setTitle("New user joined")
        .setColor(settings.colors.discord.low)
        .setDescription(
            `${member.user.username} joined the server.
\`\`\`
tag:        ${member.user.tag}
ID:         ${member.user.id}
bot:        ${member.user.bot}
created:    ${member.user.createdAt}
\`\`\``
        )

    spamChannel.send(embed);
})

/**
 * Run a test against the 'DontBeADooDooHead' role; designed to stop people from
 * changing their nickname.
 * @param {GuildMember} oldMember the targeted member before they updated
 * @param {GuildMember} newMember the targeted member after they updated
 * @async
 */
client.on("guildMemberUpdate", async (oldMember, newMember) => {
    console.log("Guild member updated!", oldMember.tag);
    const doodoohead = '662719620603576322';

    // Check if the member updated their nickname, if they have the DooDooHead
    // role, and if the bot changed their nickname.
    if (!botChangedNickname &&
        newMember._roles.indexOf(doodoohead) >= 0 &&
        oldMember.nickname !== newMember.nickname) {
        console.log("Got unauthorized nickname change; reverting!");
        botChangedNickname = true;
        await newMember.setNickname(oldMember.nickname);
        botChangedNickname = false;
    } else if (botChangedNickname) {
        // The bot changed the nickname, reset the internal flag.
        botChangedNickname = false;
    }
})

client.on("message", async message => {

    if (message.content.startsWith(`${settings.prefix}seen`)) {
        console.log(`Got ${settings.prefix}seen message`);
        sendLastSeen(message);

    } else if (message.content.startsWith(`${settings.prefix}help`)) {
        console.log(`Got ${settings.prfix}help message`);
        sendHelpDialogue(message);

    } else if (message.content.startsWith(`${settings.prefix}nick`)) {
        console.log(`Got ${settings.prefix}nick message`);
        message.reply("Not implemented yet!");
    }

    // Non-callable events
    else if (message.channel.name === "remo-admin") {
        handleAdminMessage(message);
    }
})

/**
 * When a message is deleted, post the deleted message in the spam channel.
 * Due to the limitations of Discord, it is not currently possible to see who
 * see who deleted the message.
 * @param {Message} message the message that was deleted
 * @async
 */
client.on("messageDelete", async message => {
    const channel = message.channel.name;
    const author = message.author.tag;
    const content = message.content;
    const embed = new RichEmbed()
        .setTitle(`Message deleted in #${channel}`)
        .setColor(settings.colors.discord.med)
        .setDescription(`${author}: ${content}`);

    spamChannel.send(embed);
})

/**
 * Checks a remo user for accounts that have been banned on the same ip
 * @param {String} username the Remo user to test for
 * @async
 */
const checkForAlts = async (message, username) => {
    const alts = await utilities.checkIfBanned(username);
    console.log(alts);
    if (alts !== "") {
        adminChannel.send(`**WARNING!!!** This account has suspected banned alts! ${alts}`);
        const embed = new RichEmbed()
            .setTitle("Found Banned Accounts on Connecting IP")
            .setColor(settings.colors.remo.high)
            .setDescription(`${message.content}\n${alts}`);
        spamChannel.send(embed);
    }
}

/**
 * Fires when a message is sent in the admin channel. Looks for users logging in
 * or specific keywords that I've deemed important to know of when uttered.
 * @param {Message} message the originating message
 * @async
 */
const handleAdminMessage = async message => {
    if (message.content.includes("true") ||//im so gonna sign up with username true
        message.content.includes("?ban") ||
        message.content.includes("GGK")) {
        sendBanEvent(message);
        if (message.content.startsWith("?ban")) {
            const args = message.content.slice(settings.prefix.length).split(/ +/);
            if (args[1]) {
                await utilities.updateBannedUser(args[1]);
            }
        }
    } else if (message.content.includes("-------------------------------") &&
        message.author.username === "RemoBot") {
        await utilities.dbCheck(message.content);
        const username = message.content.match(/(?<=\*\*).*(?=\*\*)/)[0];
        if (await utilities.getUserFromDatabase(username).error === "Not found") { // getUser
            const embed = new RichEmbed()
                .setTitle("New Remo User Joined")
                .setColor(settings.colors.remo.med)
                .setDescription(message.content);
            spamChannel.send(embed);
            adminChannel.send("Hey! This user isn't in my database. Are they new?");
        }
        await checkForAlts(message, username); // and getUser run at the same time
    }
}

/**
 * Send a message to the skeetbot channel when a user/ip is banned, or a banned
 * user logs in
 * @param {Message} message the originating message
 */
const sendBanEvent = message => {
    console.log("Got ban message or login, sending to skeetbot channel");
    const embed = new RichEmbed()
        .setTitle("Got Ban Info")
        .setColor(settings.colors.remo.high)
        .setDescription(message.content);
    spamChannel.send(embed);
}

/**
 * Sends a help dialogue to the channel where the message was called.
 * 
 * @param {Message} message the originating message
 */
const sendHelpDialogue = message => {
    message.channel.send(`\`\`\`
${settings.prefix}info @user    Show a 'new user joined' embed with the tagged user.
${settings.prefix}seen user     Shows the last time a Remo user was seen in my database.
${settings.prefix}help          Shows this dialogue.
\`\`\``)
}

/**
 * Sends the last seen time from the database for a specific user.
 * 
 * @param {Message} message the message that triggered the event
 * @param {String} user the Remo username to get
 * @async
 */
const sendLastSeen = async (message, user) => {
    const time = utilities.getLastSeen(user);
    if (!time.error) {
        message.channel.send(`Last seen: ${time}`)
    } else {
        message.channel.send(time.error);
    }
}

console.log("Skeetbot starting up!");
client.login(settings.token);