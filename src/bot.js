// src/index.js
require("dotenv").config();
const { TOKEN } = process.env;
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

// Initialize client with necessary intents for guilds, messages, reactions, and members
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Load commands dynamically into client.commands collection
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    console.log(`Checking command file: ${file}`);

    if (!command?.data || !command?.execute) {
        console.error(`Invalid command file: ${file}`);
        console.log('Exported value was:', command);
        continue;
    }

    client.commands.set(command.data.name, command);
    console.log(`Loaded command: ${command.data.name}`);
}

// Load event handlers dynamically
const eventsPath = path.join(__dirname, 'events');

for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
    const eventPath = path.join(eventsPath, file);
    const event = require(eventPath);

    console.log(`Loading event file: ${file}`);

    if (!event?.name || !event?.execute) {
        console.error(`Invalid event file: ${file}`);
        console.log('Exported value was:', event);
        continue;
    }

    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Login to Discord
client.login(TOKEN);