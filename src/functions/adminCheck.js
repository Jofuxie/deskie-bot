// src/functions/adminCheck.js
const { PermissionFlagsBits } = require('discord.js');

const ADMIN_ROLE_ID = '1555544474220757115';

// Café Cloud admins: anyone with the Admin role or Discord's Administrator permission.
function isAdmin(member) {
  return Boolean(
    member?.roles?.cache?.has(ADMIN_ROLE_ID) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

module.exports = { ADMIN_ROLE_ID, isAdmin };
