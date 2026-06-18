const express = require('express');
const cors = require("cors");
const app = express()
require('dotenv').config()
const port = 5000


const { MongoClient, ServerApiVersion } = require('mongodb');
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
  res.send('Hello World!')
})


const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("aligntask_db")
    const tasksCollection = database.collection("tasks");
  //for getting task
  app.get("/tasks", async (req, res) => {
  try {
    const { userId } = req.query;

    const filter = userId ? { userId } : {};

    const tasks = await database.collection("tasks").find(filter).toArray();

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
    //for posting tasks
    app.post("/tasks", async (req, res) => {
  try {
    const { title, category, description, budget, deadline, userId } = req.body;

    if (!title || !category || !description || !budget || !deadline) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const newTask = {
      title,
      category,
      description,
      budget: Number(budget),
      deadline,
      userId,
      status: "open", // IMPORTANT DEFAULT RULE
      createdAt: new Date(),
    };

    const result = await database.collection("tasks").insertOne(newTask);

    res.status(201).json({
      success: true,
      taskId: result.insertedId,
      message: "Task created successfully",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})