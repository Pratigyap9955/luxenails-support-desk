import type { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  ticketId?: string;
  /** Omit to broadcast to every active user. */
  userId?: string | null;
}

export async function notify(input: NotifyInput) {
  if (input.userId) {
    return prisma.notification.create({
      data: {
        userId: input.userId,
        ticketId: input.ticketId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
      },
    });
  }

  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
  if (users.length === 0) return null;

  return prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      ticketId: input.ticketId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
    })),
  });
}

/** Appends to a ticket's audit trail. Every workflow step writes one of these. */
export async function logEvent(
  ticketId: string,
  type: string,
  message: string,
  options: { actorId?: string | null; actorName?: string; meta?: object } = {},
) {
  return prisma.ticketEvent.create({
    data: {
      ticketId,
      type,
      message,
      actorId: options.actorId ?? null,
      actorName: options.actorName ?? "AI Engine",
      meta: (options.meta ?? {}) as object,
    },
  });
}
