from __future__ import annotations

from prisma import Prisma


# Shared Prisma client instance for app lifecycle usage.
prisma = Prisma()


async def connect_prisma() -> None:
    if not prisma.is_connected():
        await prisma.connect()


async def disconnect_prisma() -> None:
    if prisma.is_connected():
        await prisma.disconnect()
