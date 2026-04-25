// Curated list of known public RedVoice servers. Adding a server here =
// shipping in the next client release. Submissions go through GitHub issues
// for human review (see "Submit your server" link in the picker).

export interface PublicServerEntry {
  name: string;
  url: string;
  description: string;
  operator: string;
  region?: string;
  inviteOnly?: boolean;
}

export const PUBLIC_SERVERS: PublicServerEntry[] = [
  {
    name: "RedVoice (R3dWolfie)",
    url: "https://voice.r3dwolfie.com",
    description: "Reference instance run by the project author. Friends + community testers.",
    operator: "R3dWolfie",
    region: "Asia",
    inviteOnly: false,
  },
];
