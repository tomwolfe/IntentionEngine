export const mockEmailService = {
  send: async (to: string, subject: string, body: string) => {
    console.log(`[MOCK EMAIL] To: ${to}, Subject: ${subject}`);
    return { success: true, messageId: `mock_${Math.random().toString(36).substring(7)}` };
  }
};
