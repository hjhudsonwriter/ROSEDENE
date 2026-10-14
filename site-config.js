// Everything that is specific to one house. See CLONING.md for the full checklist
// (colours live in theme.css; icons in icons/; install name in manifest.webmanifest).
export const siteConfig = {
  // Shown in the header and on the passcode screen as "<name> <title>".
  name: 'Rosedene',
  title: 'Task Tracker',

  // Keeps this app's saved data (passcode, "I'm", view) separate from any other copy
  // of the app hosted on the same website. Use a different value for every house.
  storagePrefix: 'rosedene',

  // Starting lists for a brand-new board. Once a board exists, people and rooms are
  // edited in the app (Manage) and stored in the shared database.
  people: ['Steve', 'Harry', 'Em', 'Gail', 'Tradesperson'],
  rooms: ['Kitchen', 'Lounge', 'Dining Room', 'Hall & Stairs', 'Bathroom', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Garden', 'Garage'],
};
