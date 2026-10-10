module.exports = {
  apps: [
    {
      name: "icode-server",
      script: "index.mjs",
      env: {
        "NODE_ENV": "production"
      }
    },
    {
      name: "icode-ngrok",
      script: "ngrok",
      args: "http 3000 --log=stdout", // 3000 = PORT kamu di .env
      interpreter: "none" // penting biar jalanin ngrok langsung
    }
  ]
}