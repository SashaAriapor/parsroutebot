import { prisma } from '@/db/client';
import { TicketStatus } from '@prisma/client';

export async function createTicket(userId: bigint, text: string) {
  return prisma.ticket.create({
    data: {
      userId,
      messages: {
        create: { text, fromAdmin: false },
      },
    },
    include: { messages: true },
  });
}

export async function addMessage(ticketId: number, text: string, fromAdmin: boolean) {
  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId, text, fromAdmin },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date(), status: TicketStatus.OPEN },
    }),
  ]);
  return message;
}

export async function getTicket(ticketId: number) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, user: true },
  });
}

export async function listUserTickets(userId: bigint) {
  return prisma.ticket.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
}

export async function getOpenTicketsCount(userId: bigint) {
  return prisma.ticket.count({ where: { userId, status: TicketStatus.OPEN } });
}

export async function setChannelMessageId(ticketId: number, channelMessageId: number) {
  return prisma.ticket.update({
    where: { id: ticketId },
    data: { channelMessageId },
  });
}

export async function closeTicket(ticketId: number) {
  return prisma.ticket.update({
    where: { id: ticketId },
    data: { status: TicketStatus.CLOSED },
  });
}
