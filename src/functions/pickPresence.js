// src/functions/pickPresence.js
const { ActivityType } = require('discord.js');

const statuses = [
  { text: 'Pomodoro sessions', type: ActivityType.Watching },
  { text: 'for /help', type: ActivityType.Listening },
  { text: 'productivity', type: ActivityType.Playing },
];

const updateInterval = 300; // seconds
const startupDelay = 10; // seconds

module.exports = (client) => {
  let index = 0;

  const applyPresence = () => {
    const status = statuses[index];
    client.user.setActivity(status.text, { type: status.type });
    index = (index + 1) % statuses.length;
  };

  setTimeout(() => {
    applyPresence();
    setInterval(applyPresence, updateInterval * 1000);
  }, startupDelay * 1000);
};