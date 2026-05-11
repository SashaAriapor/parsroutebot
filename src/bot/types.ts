import { type Context, type SessionFlavor } from 'grammy';
import { type ConversationFlavor } from '@grammyjs/conversations';
import { type User } from '@prisma/client';

// Placeholder session data — populate as conversations are added.
export type SessionData = Record<string, never>;

export type BotContext = Context &
  ConversationFlavor &
  SessionFlavor<SessionData> & {
    dbUser?: User;
  };
