# CDK Infrastructure for FAQtiv Agents

## ✅ Deployment Prerequisites

* AWS CDK v2
* Node.js >= 18
* `~/.aws/credentials` with an active profile (e.g., `dev`)
* Bootstrapped CDK environment:

### Setup .env

Copy `.env.example` and replace the values as needed

---

## ✨ Deploy Commands

```bash
# One-time setup
export AWS_PROFILE=dev
npm run deploy-bootstrap
```

```bash
export AWS_PROFILE=dev

# Deploy to dev environment
npm run deploy:dev

# Destroy dev environment
npm run deploy-destroy:dev
```

