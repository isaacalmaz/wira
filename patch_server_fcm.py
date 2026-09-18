with open('backend/server.js', 'r') as f:
    content = f.read()

if "const notificationRoutes" not in content:
    content = content.replace("const midtransRoutes = require('./routes/midtrans');", "const midtransRoutes = require('./routes/midtrans');\nconst notificationRoutes = require('./routes/notification');")
    content = content.replace("app.use('/api/midtrans', midtransRoutes);", "app.use('/api/midtrans', midtransRoutes);\napp.use('/api/notifications', notificationRoutes);")
    
    with open('backend/server.js', 'w') as f:
        f.write(content)
