import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthProvider
} from "@atacredits/shared";
import { WalletService } from "./walletService.js";

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletService: WalletService
  ) {}

  async login(input: AuthLoginRequest): Promise<AuthLoginResponse> {
    const email = input.email.trim().toLowerCase();
    const provider: AuthProvider = input.provider ?? "email_magic_link";
    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email }
    });

    await this.walletService.ensureUserResources(user.id);
    const sessionToken = randomUUID();
    await this.prisma.session.create({
      data: {
        token: sessionToken,
        userId: user.id,
        provider: provider === "google_mock" ? "GOOGLE_MOCK" : "EMAIL_MAGIC_LINK"
      }
    });

    const [wallet, settings] = await Promise.all([
      this.walletService.getWallet(user.id),
      this.walletService.getSettings(user.id)
    ]);

    return {
      sessionToken,
      user: {
        id: user.id,
        email: user.email
      },
      wallet,
      settings
    };
  }

  async getUserIdFromToken(token: string): Promise<string | null> {
    const session = await this.prisma.session.findUnique({
      where: { token },
      select: { userId: true }
    });
    return session?.userId ?? null;
  }
}
