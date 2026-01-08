## Stripe Webhook Configuration

The application includes a Stripe webhook listener for automatic license management.

### Environment Variables

Add the following to your `.env` file:

```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Setting up Stripe Webhooks

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Set the endpoint URL to: `https://your-domain.com/api/webhooks/stripe`
4. Select the following events:
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
   - `invoice.payment_failed`
   - `invoice.paid`
   - `checkout.session.completed`
5. Copy the webhook signing secret and add it to `STRIPE_WEBHOOK_SECRET`

### Webhook Events Handled

| Event | Action |
|-------|--------|
| `customer.subscription.deleted` | Downgrades to free tier, schedules employee disabling |
| `customer.subscription.updated` | Syncs subscription status, handles pending cancellations |
| `invoice.payment_failed` | Creates platform notification for admins |
| `checkout.session.completed` | Upgrades to paid tier, activates subscription |
| `invoice.paid` | Confirms subscription renewal |

### Scheduled Jobs

A scheduled job disables employees after their grace period ends:

```bash
# Run manually
node backend/jobs/disableScheduledEmployees.js

# Or set up as a cron job (daily at midnight)
0 0 * * * cd /path/to/project && node backend/jobs/disableScheduledEmployees.js
```

