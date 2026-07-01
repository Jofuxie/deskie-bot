// src/functions/cooldown.js
const cooldowns = new Map();

// Returns 0 and starts the cooldown if the user is clear to act,
// otherwise returns the remaining seconds without resetting the timer.
function checkCooldown(command, userId, seconds) {
  const key = `${command}:${userId}`;
  const now = Date.now();
  const expiresAt = cooldowns.get(key);

  if (expiresAt && expiresAt > now) {
    return Math.ceil((expiresAt - now) / 1000);
  }

  cooldowns.set(key, now + seconds * 1000);
  return 0;
}

module.exports = { checkCooldown };
