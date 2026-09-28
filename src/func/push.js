const { Expo } = require('expo-server-sdk');

const User = require('../models/User');

// -------------------------------------------------------------------------- //

const expo = new Expo({
  useFcmV1: true,
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

const templates = {
  submitted: {
    title: "Off they go!",
    body: "Your documents have been sent to the shop. Sit tight!",
  },
  queued: {
    title: "You're in line",
    body: "The shop got your documents and added them to the print queue.",
  },
  printing: {
    title: "Hot off the press",
    body: "The printer's busy bringing your documents to life right now.",
  },
  cancelled: {
    title: "Job called off",
    body: "This print job was cancelled. No prints, nothing charged.",
  },
  failed: {
    title: "Well, that didn't go to plan",
    body: "We couldn't finish this print job. Give it another go or check in with the shop.",
  },
  completed: {
    title: "Ready and waiting",
    body: "Your prints are done! Swing by the shop to grab them.",
  },
}

// -------------------------------------------------------------------------- //

async function sendPush(pushTokens, { title, body, data }) {
  const messages = [];

  for (const pushToken of pushTokens) {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.warn(`Invalid Expo push token: ${pushToken}`);
      continue;
    }

    messages.push({
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
      channelId: 'default',
    });
  }

  const tickets = [];
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (err) {
      console.error('Push send error:', err);
    }
  }

  return tickets;
}

// -------------------------------------------------------------------------- //

// Shop made jobs have no app user to notify; the shop tells its customer.
async function notifyUserOnJobStatus(job) {
  if (job.source === 'shop') return [];

  const user = await User.findById(job.createdBy);

  const tickets = await sendPush(user.pushTokens, {
    ...templates[job.status],
    data: {
      jobId: job._id
    }
  });

  return tickets;
}

module.exports = {
  notifyUserOnJobStatus
};