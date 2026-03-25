// src/functions/pickPresence.js
const { ActivityType } = require('discord.js');

// An array of presence status options (customize as needed)
const statuses = [
  { text: 'Pomodoro sessions', type: ActivityType.Watching },
  { text: 'for /help', type: ActivityType.Listening },
  { text: 'productivity', type: ActivityType.Playing },
  // add more statuses as desired
];
const updateInterval = 300;  // in seconds, e.g. 300s = 5 minutes

module.exports = (client) => {
  let index = 0;
  // Rotate through the statuses array every [updateInterval] seconds
  setInterval(() => {
    const status = statuses[index];
    client.user.setActivity(status.text, { type: status.type });
    index = (index + 1) % statuses.length;
  }, updateInterval * 1000);
};
