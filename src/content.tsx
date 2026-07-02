import { ContentController } from "./contentController";

const controller = new ContentController();

void controller.initialize().catch((error) => {
  console.warn("[六彩] initialize failed:", error);
});
