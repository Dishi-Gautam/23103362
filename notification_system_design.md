
## Stage 5: Bulk Notification & Queue Management

### The Requirement

HR needs to send the same notification to all 50,000 students at once. They hit the "Notify All" button and expect everyone to get the email and in-app notification within minutes.

The naive approach won't work - trying to insert 50,000 records in one query will lock the database for everyone else. We need a proper queue system that can handle this without crashing.
## Stage 6: Priority Inbox

Goal: surface the few most important, recent notifications so students see what matters first.

How it works (short):
- Assign a base score by type (Placement > Result > Event).
- Add a small recency bonus for newer items.
- Sort unread items by score, then date; return top N (default 10).

Practical notes:
- The backend reads the live notifications API, scores items on read, and returns the top N. This keeps writes and storage external and the service stateless.
- For extreme scale, precompute scores or maintain a per-user top-N cache (min-heap) updated by a background worker.
- If no unread items, return an empty array and a friendly message.

```javascript
async function createNotificationWithPriority(notif) {
  const notificationID = generateUUID();
  
  await insertNotification(notificationID, notif);
  
  const baseScore = getTypeScore(notif.type);
  const recencyBonus = 20;
  
  await insertPriorityRecord({
    notificationID: notificationID,
    baseScore: baseScore,
    recencyBonus: recencyBonus
  });
  
  return notificationID;
}

function getTypeScore(type) {
  const scores = {
    'Placement': 100,
    'Result': 70,
    'Event': 50
  };
  return scores[type] || 50;
}
```

### Fetching Priority Notifications

When user asks for priority inbox, fetch top 10 sorted by score:

```javascript
async function getPriorityInbox(studentID, limit = 10) {
  const results = await db.execute(`
    SELECT 
      n.id,
      n.type,
      n.message,
      n.isRead,
      n.createdAt,
      np.baseScore,
      np.recencyBonus,
      np.finalScore
    FROM notifications n
    LEFT JOIN notification_priority np ON n.id = np.notificationID
    WHERE n.studentID = ? AND n.isRead = FALSE
    ORDER BY np.finalScore DESC, n.createdAt DESC
    LIMIT ?
  `, [studentID, limit]);
  
  return results;
}
```

### Recency Score Updates

Older notifications lose priority over time. Update recency scores daily:

```javascript
async function updateRecencyScores() {
  await db.execute(`
    UPDATE notification_priority np
    JOIN notifications n ON np.notificationID = n.id
    SET np.recencyBonus = CASE
      WHEN DATEDIFF(NOW(), n.createdAt) < 1 THEN 20
      WHEN DATEDIFF(NOW(), n.createdAt) < 3 THEN 10
      WHEN DATEDIFF(NOW(), n.createdAt) < 7 THEN 5
      ELSE 0
    END
  `);
}
```

Run this nightly:

```javascript
const CronJob = require('cron').CronJob;

new CronJob('0 0 * * *', () => {
  updateRecencyScores();
}, null, true);
```

### API Response

```javascript
router.get('/api/notifications/priority', async (req, res) => {
  const { studentID, limit = 10 } = req.query;
  
  const notifications = await getPriorityInbox(studentID, limit);
  
  res.json({
    notifications: notifications,
    total: notifications.length,
    timestamp: new Date()
  });
});
```

Response format:

```json
{
  "notifications": [
    {
      "ID": "d1c0955a-8d86-4a34-9e69-39b0a1e75dc0",
      "Type": "Placement",
      "Message": "Google hiring for SDE",
      "Timestamp": "2026-05-22 17:51:30",
      "isRead": false,
      "baseScore": 100,
      "recencyBonus": 20,
      "finalScore": 120
    },
    {
      "ID": "b2832188-ea5a-4b7c-93a5-1f22d2b85d8b",
      "Type": "Result",
      "Message": "Exam results ready",
      "Timestamp": "2026-05-20 14:30:00",
      "isRead": false,
      "baseScore": 70,
      "recencyBonus": 10,
      "finalScore": 80
    },
    {
      "ID": "a1f9b0d4-8a31-4477-9554-f528e958e09d",
      "Type": "Event",
      "Message": "Farewell party",
      "Timestamp": "2026-05-22 17:51:06",
      "isRead": false,
      "baseScore": 50,
      "recencyBonus": 20,
      "finalScore": 70
    }
  ],
  "total": 3,
  "timestamp": "2026-05-22T17:52:00Z"
}
```

### Screenshots For Priority Inbox

The UI would show them in score order:

```
PRIORITY INBOX

1. [NEW] Google hiring for SDE (Placement)
   Score: 120 - Most Recent + High Priority
   
2. [NEW] Exam results ready (Result)
   Score: 80 - 2 days old but important
   
3. [NEW] Farewell party (Event)
   Score: 70 - New but lower priority
   
4. [OLD] Campus drive (Event)
   Score: 35 - Old event

---SHOW MORE---
```

### Query Performance

The index on finalScore makes this fast:

```sql
CREATE INDEX idx_priority_score ON notification_priority(finalScore DESC);
```

Even with millions of notifications, fetching top 10 is milliseconds.

### Edge Cases

What if user has no unread notifications? Return empty list:

```javascript
router.get('/api/notifications/priority', async (req, res) => {
  const { studentID, limit = 10 } = req.query;
  
  const notifications = await getPriorityInbox(studentID, limit);
  
  if (notifications.length === 0) {
    return res.json({
      notifications: [],
      total: 0,
      message: 'No unread notifications'
    });
  }
  
  res.json({
    notifications: notifications,
    total: notifications.length
  });
});
```
