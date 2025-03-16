const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 3000;

// Set testing mode if needed (for example, to restrict to a subset of images)
// const testing = true;

// Serve static files from the "public" directory and parse JSON bodies.
app.use(express.static("public"));
app.use(express.json());

// Path to persistence file.
const dataFile = path.join(__dirname, "data.json");

// Load images from image.json
let images = JSON.parse(fs.readFileSync("image.json", "utf8"));

// Example for testing mode: if you want to use only a subset of images
// if (testing) {
//   images = images.slice(0, 10);
// }

// In-memory data structures for vote data.
let ratings = {};
let matchups = {};

// Initialize Elo ratings (base rating 1500 for each image)
images.forEach((img) => {
  ratings[img.id] = 1500;
});

// Load persistent data if available.
if (fs.existsSync(dataFile)) {
  try {
    const savedData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    ratings = savedData.ratings || ratings;
    matchups = savedData.matchups || matchups;
  } catch (err) {
    console.error("Error reading data.json:", err);
  }
}

// Function to save in-memory data to file.
function saveData() {
  const data = { ratings, matchups };
  fs.writeFile(dataFile, JSON.stringify(data, null, 2), (err) => {
    if (err) console.error("Error saving data:", err);
  });
}

// Elo rating update function (used internally for head-to-head updates).
function updateElo(winner, loser, k = 32) {
  const ratingWinner = ratings[winner];
  const ratingLoser = ratings[loser];
  const expectedWinner =
    1 / (1 + Math.pow(10, (ratingLoser - ratingWinner) / 400));
  const expectedLoser =
    1 / (1 + Math.pow(10, (ratingWinner - ratingLoser) / 400));
  ratings[winner] = ratingWinner + k * (1 - expectedWinner);
  ratings[loser] = ratingLoser + k * (0 - expectedLoser);
}

// Helper function: Calculate global stats for an image based on all matchups.
function getGlobalStats(imageId) {
  let wins = 0;
  let matches = 0;
  Object.values(matchups).forEach((match) => {
    if (match.hasOwnProperty(imageId)) {
      const totalVotes = Object.values(match).reduce(
        (sum, val) => sum + val,
        0
      );
      wins += match[imageId];
      matches += totalVotes;
    }
  });
  return { wins, matches };
}

// Endpoint: GET /vote - Returns two random images for voting.
app.get("/vote", (req, res) => {
  let idx1 = Math.floor(Math.random() * images.length);
  let idx2 = Math.floor(Math.random() * images.length);
  while (idx2 === idx1) {
    idx2 = Math.floor(Math.random() * images.length);
  }
  res.json({
    image1: images[idx1],
    image2: images[idx2],
  });
});

// Endpoint: POST /vote - Records a vote, updates Elo ratings, and returns global stats for the winner.
app.post("/vote", (req, res) => {
  const { image1, image2, winner } = req.body;

  // Validate that the winner is one of the two images shown.
  if (![image1, image2].includes(winner)) {
    return res.status(400).json({ error: "Invalid vote" });
  }

  // Normalize the matchup key by sorting the image IDs.
  const pairKey = [image1, image2].sort().join("_");

  // Initialize the matchup record if not present.
  if (!matchups[pairKey]) {
    matchups[pairKey] = {
      [image1]: 0,
      [image2]: 0,
    };
  }

  // Record the vote by incrementing the win count for the selected image.
  matchups[pairKey][winner] += 1;

  // Update Elo ratings.
  const loser = winner === image1 ? image2 : image1;
  updateElo(winner, loser);

  // Save updated data to file.
  saveData();

  // Compute global stats for the winning image.
  const stats = getGlobalStats(winner);
  const alpha = 1,
    beta = 1;
  const bayesianWinRate =
    stats.matches > 0
      ? (((stats.wins + alpha) / (stats.matches + alpha + beta)) * 100).toFixed(
          1
        )
      : "N/A";

  // Return only the global stats for the winner.
  res.json({
    message: "Vote recorded",
    winner: winner,
    globalStats: {
      wins: stats.wins,
      matches: stats.matches,
      bayesianWinRate: bayesianWinRate,
    },
  });
});

// Endpoint: GET /leaderboard - Returns all images (only those with matches) ranked by Bayesian win rate.
app.get("/leaderboard", (req, res) => {
  // Compute total wins and total matches for each image.
  const winsByImage = {};
  const matchesByImage = {};

  images.forEach((img) => {
    winsByImage[img.id] = 0;
    matchesByImage[img.id] = 0;
  });

  Object.values(matchups).forEach((match) => {
    const imageIds = Object.keys(match);
    const totalVotes = imageIds.reduce((sum, key) => sum + match[key], 0);
    imageIds.forEach((id) => {
      winsByImage[id] += match[id];
      matchesByImage[id] += totalVotes;
    });
  });

  const alpha = 1;
  const beta = 1;

  const leaderboard = images
    .filter((img) => matchesByImage[img.id] > 0)
    .map((img) => {
      const wins = winsByImage[img.id];
      const matches = matchesByImage[img.id];
      const bayesianWinRate = ((wins + alpha) / (matches + alpha + beta)) * 100;
      return {
        id: img.id,
        link: img.link,
        totalMatchups: matches,
        bayesianWinRate: bayesianWinRate.toFixed(1),
      };
    });

  leaderboard.sort(
    (a, b) => Number(b.bayesianWinRate) - Number(a.bayesianWinRate)
  );
  res.json(leaderboard);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
