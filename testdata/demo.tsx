import { dashboard } from "../app.tsx";

dashboard({
  fixture: true,
  history: false,
  mineOnly: true,
  lookbackHours: 48,
});
