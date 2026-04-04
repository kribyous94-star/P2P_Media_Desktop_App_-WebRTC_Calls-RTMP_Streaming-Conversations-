/**
 * PM2 ecosystem — P2P Media App
 *
 * Utilisation :
 *   pm2 start ecosystem.config.cjs          # démarrer
 *   pm2 stop p2p-server                     # arrêter
 *   pm2 restart p2p-server                  # redémarrer
 *   pm2 logs p2p-server                     # logs en direct
 *   pm2 save && pm2 startup                 # persistance au reboot
 *
 * Prérequis : npm run build doit avoir été exécuté au préalable.
 */
module.exports = {
  apps: [
    {
      name:        "p2p-server",
      script:      "./apps/server/dist/index.js",
      cwd:         __dirname,

      // Rechargement sans coupure (nécessite que le serveur gère SIGINT)
      wait_ready:  false,
      kill_timeout: 5000,

      // Redémarrage automatique sur crash, mais pas sur sortie volontaire (exit 0)
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,

      // Variables d'environnement — chargées depuis apps/server/.env
      env: {
        NODE_ENV: "production",
      },
      // Pour passer le .env à Node.js : PM2 ne charge pas dotenv automatiquement.
      // Le serveur appelle lui-même dotenv/config au démarrage, ce qui lit
      // apps/server/.env (chemin relatif au cwd ci-dessus).
      node_args: "--enable-source-maps",

      // Logs
      out_file:    "./logs/p2p-server.out.log",
      error_file:  "./logs/p2p-server.err.log",
      merge_logs:  true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
