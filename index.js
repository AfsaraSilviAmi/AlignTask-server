const express = require('express');
const cors = require("cors");
const Stripe = require("stripe");
const app = express()
require('dotenv').config()
const port = 5000
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    const tasksCollection = database.collection("tasks")
    const proposalsCollection = database.collection("proposals")
    const paymentsCollection = database.collection("payments")
  //for getting task
  app.get("/tasks", async (req, res) => {
  try {
    const { userId } = req.query;

    const filter = userId ? { userId } : {};

    const tasks = await tasksCollection.find(filter).toArray();

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
  clientName: req.body.clientName,
  clientEmail: req.body.clientEmail,

  status: "open",
  createdAt: new Date(),
};

    const result = await tasksCollection.insertOne(newTask);

    res.status(201).json({
      success: true,
      taskId: result.insertedId,
      message: "Task created successfully",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//delete tasks
app.delete("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const task = await tasksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!task) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

   if (task.status !== "open") {
  return res.status(400).json({
    error: "Only open tasks can be deleted",
  });
}

const result = await tasksCollection.deleteOne({
  _id: new ObjectId(id),
});

    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});


//updating tasks
app.patch("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
const task = await tasksCollection.findOne({
  _id: new ObjectId(id),
});

if (!task) {
  return res.status(404).json({
    error: "Task not found",
  });
}

if (task.status !== "open") {
  return res.status(400).json({
    error: "Only open tasks can be edited",
  });
}
    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          title: req.body.title,
          category: req.body.category,
          description: req.body.description,
          budget: Number(req.body.budget),
          deadline: req.body.deadline,
        },
      }
    );

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});
//browsing tasks
app.get("/browse-tasks", async (req, res) => {
  const tasks = await tasksCollection
    .find({ status: "open" })
    .toArray();

  res.json(tasks);
});
//posting proposals 
app.post("/proposals", async (req, res) => {
  try {
   const {
  taskId,
  freelancerId,
  freelancerName,
  freelancerEmail,
  budget,
  deliveryDate,
  message,
} = req.body;
    // 1. prevent duplicate proposal
    const existing = await proposalsCollection.findOne({
      taskId,
      freelancerId,
    });

    if (existing) {
      return res.status(400).json({
        error: "You already submitted a proposal",
      });
    }
if (!freelancerId || !freelancerEmail) {
  return res.status(403).json({
    error: "Only freelancers can apply",
  });
}
   const proposal = {
  taskId,
  freelancerId,
  freelancerEmail,
   freelancerName,
  budget: Number(budget),

  deliveryDate: new Date(deliveryDate),

  message,
  status: "pending",
  createdAt: new Date(),
};
    const result = await proposalsCollection.insertOne(proposal);

    res.json({
      success: true,
      insertedId: result.insertedId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//get proposals
app.get("/proposals/:taskId", async (req, res) => {
  try {
    const proposals = await proposalsCollection
      .find({ taskId: req.params.taskId })
      .toArray();

    res.json(proposals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//accepting and rejecting proposals
app.patch("/proposals/accept/:id", async (req, res) => {
  try {
    const proposalId = req.params.id;

    const proposal = await proposalsCollection.findOne({
      _id: new ObjectId(proposalId),
    });

    if (!proposal) {
      return res.status(404).json({ error: "Not found" });
    }

    const task = await tasksCollection.findOne({
      _id: new ObjectId(proposal.taskId),
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // 1. mark accepted proposal
    await proposalsCollection.updateOne(
      { _id: new ObjectId(proposalId) },
      { $set: { status: "accepted" } }
    );

    // 2. reject all others
    await proposalsCollection.updateMany(
      {
        taskId: proposal.taskId,
        _id: { $ne: new ObjectId(proposalId) },
      },
      { $set: { status: "rejected" } }
    );

    // 3. update task
    await tasksCollection.updateOne(
      { _id: new ObjectId(proposal.taskId) },
      {
        $set: {
          status: "in progress",
          acceptedProposalId: proposalId,
        },
      }
    );

    // 4. SAVE PAYMENT RECORD (NEW PART)
    await paymentsCollection.insertOne({
      proposalId: proposalId,
      taskId: proposal.taskId,

      clientEmail: task.clientEmail || task.userId,

      freelancerId: proposal.freelancerId,
      freelancerName: proposal.freelancerName,
      freelancerEmail: proposal.freelancerEmail,

      amount: proposal.budget,

      paymentStatus: "paid",

      createdAt: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//rejecting proposals
app.patch("/proposals/reject/:id", async (req, res) => {
  await proposalsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: "rejected" } }
  );

  res.json({ success: true });
});

//getting tasks details
app.get("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const task = await tasksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//for payment/checkout
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { proposalId, amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],

      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Freelancer Project Payment",
            },
            unit_amount: amount * 100,
          },
          quantity: 1,
        },
      ],

      success_url:
        `${process.env.CLIENT_URL}/payment/success?proposalId=${proposalId}`,

      cancel_url:
        `${process.env.CLIENT_URL}/payment/cancel`,
    });

    res.json({
      url: session.url,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

//get payment for admin
app.get("/payments", async (req, res) => {
  try {
    const payments = await paymentsCollection
      .find()
      .sort({ paidAt: -1 })
      .toArray();

    res.json(payments);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});
//earning page for freelancer
app.get("/payments/freelancer/:email", async (req, res) => {
  try {
    const payments = await paymentsCollection
      .find({
        freelancerEmail: req.params.email,
      })
      .toArray();

    res.json(payments);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
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