require('dotenv').config();
const cron = require('node-cron');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('WhatsApp bot is running'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  WHATSAPP_GROUP_ID,
  CRON_SCHEDULE
} = process.env;

// -----------------------------
// Environment Validation
// -----------------------------
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

if (!WHATSAPP_GROUP_ID) {
  console.warn(
    'WHATSAPP_GROUP_ID is missing. Run "npm run list-groups", copy the group ID into .env, then restart.'
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

// -----------------------------
// WhatsApp Client
// -----------------------------
const puppeteer = require("puppeteer");

const browserPath = puppeteer.executablePath();

console.log("Chrome Path:", browserPath);

const client = new Client({
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  },
});

client.on("qr", (qr) => {
  console.log("Scan this QR code with WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("WhatsApp authenticated.");
});

client.on("auth_failure", (msg) => {
  console.error("Authentication failed:", msg);
});

client.on("disconnected", (reason) => {
  console.error("WhatsApp disconnected:", reason);
});

client.on("ready", () => {
  console.log("WhatsApp client ready.");

  const schedule = CRON_SCHEDULE || "* * * * *";

  console.log("Cron Schedule:", schedule);

  cron.schedule(schedule, () => {
    sendDueTasks().catch(console.error);
  });

  // Uncomment this line if you want to check immediately
  // sendDueTasks().catch(console.error);
});

// -----------------------------
// Current Date & Time
// -----------------------------
function nowParts() {
  const now = new Date();

  const pad = (n) => String(n).padStart(2, "0");

  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  };
}

// -----------------------------
// Send Due Tasks
// -----------------------------
async function sendDueTasks() {

  if (!WHATSAPP_GROUP_ID) return;

  const { date: today, time: currentTime } = nowParts();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, task_time, task_text")
    .eq("task_date", today)
    .lte("task_time", currentTime)
    .order("task_time", { ascending: true });

  if (error) {
    console.error("Supabase Error:", error.message);
    return;
  }

  if (!tasks || tasks.length === 0) {
    console.log("No due tasks.");
    return;
  }

  // Group by same time
  const grouped = {};

  tasks.forEach(task => {

    if (!grouped[task.task_time]) {
      grouped[task.task_time] = [];
    }

    grouped[task.task_time].push(task);

  });

  for (const time of Object.keys(grouped)) {

    const currentTasks = grouped[time];

    const message = buildMessage(
      today,
      time,
      currentTasks
    );

    try {

      await client.sendMessage(
        WHATSAPP_GROUP_ID,
        message
      );

      console.log(
        `Sent ${currentTasks.length} task(s) scheduled for ${time}`
      );

      const ids = currentTasks.map(t => t.id);

      // DELETE TASKS AFTER SUCCESSFUL SEND
      const { error: deleteError } = await supabase
        .from("tasks")
        .delete()
        .in("id", ids);

      if (deleteError) {

        console.error(
          "Failed to delete sent tasks:",
          deleteError.message
        );

      } else {

        console.log(
          `Deleted ${ids.length} task(s) from Supabase.`
        );

      }

    } catch (err) {

      console.error(
        `Failed to send tasks for ${time}:`,
        err.message
      );

      // Tasks remain in database and will retry next minute.

    }

  }

}

// -----------------------------
// WhatsApp Message
// -----------------------------
function buildMessage(date, time, tasks) {

  const heading =
`Today's Tasks

 Date : ${date}
 Time : ${time.substring(0,5)}

`;

  const body = tasks
    .map((task, index) =>
      `${index + 1}. ${task.task_text}`
    )
    .join("\n");

  return heading + body;

}

// -----------------------------
client.initialize();
