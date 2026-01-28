import passport from "passport";
import SteamStrategy from "passport-steam";
import { prisma } from "./db.js";
import { env } from "./env.js";

interface SteamProfileJson {
  steamid: string;
  personaname: string;
  avatarfull?: string;
}

interface SteamProfile {
  provider: "steam";
  _json: SteamProfileJson;
  id: string;
  displayName: string;
}

type DoneFn = (err: unknown, user?: Express.User | false | null) => void;

export function configurePassport(): void {
  // Serialize user to session (store only the user ID)
  passport.serializeUser((user, done) => {
    done(null, (user as { id: string }).id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  // Steam Strategy
  passport.use(
    new SteamStrategy(
      {
        returnURL: `${env.backendUrl}/auth/steam/callback`,
        realm: env.backendUrl,
        apiKey: env.steamApiKey,
      },
      async (
        _identifier: string,
        profile: SteamProfile,
        done: DoneFn,
      ): Promise<void> => {
        try {
          const steamProfile = profile._json;

          // Upsert user (create if not exists, update if exists)
          const user = await prisma.user.upsert({
            where: { steamId64: steamProfile.steamid },
            update: {
              username: steamProfile.personaname,
              avatarUrl: steamProfile.avatarfull || null,
            },
            create: {
              steamId64: steamProfile.steamid,
              username: steamProfile.personaname,
              avatarUrl: steamProfile.avatarfull || null,
            },
          });

          done(null, user);
        } catch (err) {
          done(err);
        }
      },
    ),
  );
}

export { passport };
