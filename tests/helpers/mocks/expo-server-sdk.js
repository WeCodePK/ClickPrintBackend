class Expo {
  constructor() {}

  static isExpoPushToken() {
    return true;
  }

  chunkPushNotifications(messages) {
    return [messages];
  }

  async sendPushNotificationsAsync(chunk) {
    return chunk.map(() => ({ status: 'ok' }));
  }
}

module.exports = { Expo };
