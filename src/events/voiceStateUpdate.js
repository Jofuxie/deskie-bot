// src/events/voiceStateUpdate.js
const { Events } = require('discord.js');
const { handleVoiceStateUpdate } = require('../functions/readingSessions');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      console.error('voiceStateUpdate handling error:', error);
    }
  },
};
