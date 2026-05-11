import { type Context, type SessionFlavor } from 'grammy';
import { type ConversationFlavor } from '@grammyjs/conversations';
import { type User } from '@prisma/client';

export type SessionData = {
  pendingFollowupTicketId?: number;
};

export type BotContext = Context &
  ConversationFlavor &
  SessionFlavor<SessionData> & {
    dbUser?: User;
  };
