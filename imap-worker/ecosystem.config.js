module.exports = {
    apps: [
        {
            name: 'kundaro-imap-worker',
            script: 'index.js',
            node_args: '--use-system-ca',  // Force Node to use system CA store
            restart_delay: 5000,
            max_restarts: 10,
            watch: false,
            env: {
                NODE_ENV: 'production',
                // You can keep NODE_EXTRA_CA_CERTS as a fallback, but --use-system-ca is more reliable
                NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/ca-certificates.crt'
            }
        }
    ]
};



