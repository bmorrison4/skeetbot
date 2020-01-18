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
    axios.default.headers.common['key'] = settings.key;
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
    console.log("Guild member joined!", user.tag);
    const embed = new RichEmbed()
        .setTitle("New user joined")
        .setColor(0x00FFFF)
        .setDescription(
            `${user.username} joined the server.
\`\`\`
tag:        ${user.tag}
ID:         ${user.id}
bot:        ${user.bot}
created:    ${user.createdAt}
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
        .setColor(0x009999)
        .setDescription(`${author}: ${content}`);
    
    spamChannel.send(embed);
})

const sendHelpDialogue = message => {

}

console.log("Skeetbot starting up!");
client.login(settings.token);