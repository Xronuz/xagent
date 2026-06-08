/**
 * Sandbox adapter — LocalBox ishlatadi (bepul, local filesystem + child_process)
 * @upstash/box interfeysi bilan to'liq mos
 */
import { LocalBox } from "./local-sandbox";

// Box type sifatida LocalBox ni ishlatamiz
export type SandboxBox = LocalBox;

export const createBox = async (accessToken: string): Promise<LocalBox> => {
  if (!accessToken) {
    throw new Error("Access token is required to create a box for the session.");
  }
  return LocalBox.create({
    runtime: "node",
    git: {
      token: accessToken,
      userName: "xagent",
      userEmail: "xronuz@gmail.com",
    },
  });
};

// getBox — boxId + accessToken kerak (token session da saqlanmagan, github service dan olamiz)
export const getBox = async (
  boxId: string,
  accessToken?: string
): Promise<LocalBox> => {
  if (!boxId) throw new Error("Box ID is required to retrieve the box.");
  const box = new LocalBox({ boxId, gitToken: accessToken });
  return box;
};