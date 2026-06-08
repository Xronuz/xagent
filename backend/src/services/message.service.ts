import { generateId, UIMessage } from "ai";
import MessageModel from "../models/message.model";
import { BadRequestException } from "../utils/app-error";


 export function sanitizeUIMessages(messages: any[]) {
    return messages
      .filter((msg) => Array.isArray(msg.parts) && msg.parts.length > 0)
      .map((message) => ({
        ...message,
        parts: message.parts
          .filter((part: any) => {
            if (
              typeof part.type === "string" &&
              part.type.startsWith("tool-") &&
              part.state === "input-available"
            ) {
              return false;
            }

            if (
              typeof part.type === "string" &&
              part.type.startsWith("tool-") &&
              part.state === "output-available" &&
              part.output == null
            ) {
              return false;
            }

            return true;
          })
          .map((part: any) => {
            const { providerExecuted, providerMetadata, ...cleanPart } = part;
            return cleanPart;
          }),
      }))
      .filter((msg) => msg.parts.length > 0);
  }


export const getSessionMessagesService = async (sessionId: string) => {
      if (!sessionId) throw new BadRequestException("Session ID is required");

      const messages = await MessageModel.find({ sessionId })
      .sort({ createdAt: 1 })
      .lean();

      const uiMessages = sanitizeUIMessages(messages
            .map((msg) => ({
                  id: msg.id,
                  role: msg.role,
                  parts: msg.parts,
            }))
      );

      return { messages: uiMessages  };
}

export const createMessageService = async (
  sessionId: string,
  messageData: UIMessage,
) => {
      if (!sessionId) throw new BadRequestException("Session ID is required");
  const message = await MessageModel.create({
    sessionId,
    id: messageData.id,
    role: messageData.role,
    parts: messageData.parts,
  });

  return { message };
}


export const upsertSessionMessagesService = async (
  sessionId: string,
  messages: UIMessage[]
) => {
  if (!sessionId) throw new BadRequestException("Session ID is required");
  if (!Array.isArray(messages) || messages.length === 0) return { messages: [] };

  const sanitizedMessages = sanitizeUIMessages(messages as any);

  const savedMessages = await Promise.all(
    sanitizedMessages.map((message) => {
      const messageId = message.id || generateId();
      return MessageModel.findOneAndUpdate(
        {
          sessionId,
          id: messageId,
        },
        {
          $set: {
            sessionId,
            id: messageId,
            role: message.role,
            parts: message.parts,
          },
        },
        { upsert: true, new: true }
      );
    })
  );

  return { messages: savedMessages };
};