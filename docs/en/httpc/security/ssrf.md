---
sidebar_label: "SSRF Protection"
title: "SSRF Protection - CyberGo HTTPC | Private IPs & Metadata"
description: "HTTPC SSRF protection in detail: default blocking of IPv4/IPv6 private IPs and cloud-metadata endpoints, precise SSRFExemptCIDRs exemptions, the AllowPrivateIPs danger comparison, DNS-rebinding defense, per-request WithAllowPrivateIPs overrides, and the RedirectWhitelist redirect whitelist."
sidebar_position: 2
---

# SSRF Protection

SSRF (Server-Side Request Forgery) is an attack where the attacker tricks the server into making requests to the internal network. The impact includes: stealing cloud-instance metadata credentials (IAM role tokens), scanning internal ports and services, accessing unauthenticated internal admin interfaces, and bypassing firewalls to reach protected resources. HTTPC enables SSRF protection by default, blocking connections to private/reserved IP ranges.

## Default Behavior

```go
cfg := httpc.DefaultConfig()
// AllowPrivateIPs = false (default) -> blocks all private/reserved IPs
```

`AllowPrivateIPs` defaults to `false`, so dialer-level SSRF validation is fully on. This differs from validating only the hostname in the URL — HTTPC validates the resolved IP at the moment it actually establishes the TCP connection, defending against DNS rebinding (see below).

## Blocked IP Ranges

HTTPC blocks every IP address unsuitable for public-internet communication, covering IPv4, IPv6, and their bypass variants.

### IPv4 Blocked Ranges

| Range | CIDR | Description |
|------|------|------|
| Loopback | `127.0.0.0/8` | localhost (includes the entire 127.x.x.x range) |
| Class A private | `10.0.0.0/8` | Internal network (RFC 1918) |
| Class B private | `172.16.0.0/12` | Internal network (RFC 1918) |
| Class C private | `192.168.0.0/16` | Internal network (RFC 1918) |
| Link-local | `169.254.0.0/16` | Auto-configuration (incl. AWS/Azure metadata) |
| CGNAT | `100.64.0.0/10` | Carrier-grade NAT (incl. Alibaba Cloud metadata `100.100.100.200`) |
| Class E reserved | `240.0.0.0/4` | Reserved addresses (`ip4[0] >= 240`) |
| "This network" | `0.0.0.0/8` | This-network identifier (`ip4[0] == 0`) |
| IETF protocol allocation | `192.0.0.0/24` | Special use |
| TEST-NET-1 | `192.0.2.0/24` | Documentation use (RFC 5737) |
| TEST-NET-2 | `198.51.100.0/24` | Documentation use (RFC 5737) |
| TEST-NET-3 | `203.0.113.0/24` | Documentation use (RFC 5737) |
| 6to4 relay | `192.88.99.0/24` | Deprecated anycast |

Additionally, ranges covered by `IsLoopback`, `IsPrivate`, `IsLinkLocalUnicast`, `IsLinkLocalMulticast`, `IsMulticast`, and `IsUnspecified` are also blocked.

### IPv6 Blocked Ranges

| Range | CIDR | Description |
|------|------|------|
| Loopback | `::1/128` | localhost |
| Unique local | `fc00::/7` | Internal network (IPv4-private equivalent) |
| Link-local | `fe80::/10` | Auto-configuration |
| Documentation prefix | `2001:db8::/32` | Documentation use (RFC 3849) |
| NAT64 | `64:ff9b::/96` | Recursively validates the embedded IPv4 |

### Bypass Defenses

HTTPC additionally blocks these common SSRF bypass techniques:

| Technique | Example | Defense |
|------|------|------|
| IPv4-mapped IPv6 | `::ffff:127.0.0.1` | Normalized to IPv4 then validated |
| Decimal integer | `2130706433` (= 127.0.0.1) | Recognized as a legacy IP literal and blocked |
| Hexadecimal | `0x7f000001`, `0x7f.0.0.1` | `0x` prefix recognized and blocked |
| Octal | `0177.0.0.1` | Leading zero recognized and blocked |
| NAT64 embedded | `64:ff9b::7f00:1` | Recursively validates the embedded IPv4 |

:::tip
These bypass defenses are especially important under cgo builds: `getaddrinfo` may accept legacy IP literals and map them to private IPs. HTTPC intercepts these forms before DNS resolution.
:::

## Cloud Metadata Endpoint Protection

Each cloud platform's instance metadata service (IMDS) is a high-value SSRF target — once reached, temporary credentials can be stolen. HTTPC blocks these addresses by default:

| Platform | Metadata address | Blocking mechanism |
|------|-----------|----------|
| AWS EC2 | `169.254.169.254` | Link-local `169.254.0.0/16` blocked |
| Azure | `169.254.169.254` | Same (link-local blocked) |
| GCP | `metadata.google.internal` | Post-DNS IP validation |
| Alibaba Cloud | `100.100.100.200` | CGNAT `100.64.0.0/10` blocked |

:::warning
Although AWS IMDSv2 requires a token, an SSRF exploit could still fetch the token first and then access the data. HTTPC's IP-level block sits lower in the stack than IMDSv2 and intercepts the connection directly. Recommended: use both — HTTPC blocking + IMDSv2 enabled for defense in depth.
:::

:::warning
Alibaba Cloud metadata (`100.100.100.200`) is in the CGNAT range (`100.64.0.0/10`), which HTTPC **blocks by default**. If you genuinely need to reach `100.64.0.0/10` for VPNs like Tailscale/WireGuard or internal routing, you must explicitly exempt it via `SSRFExemptCIDRs: []string{"100.64.0.0/10"}` — once exempted, Alibaba Cloud metadata in that range also becomes reachable, so evaluate the risk accordingly.
:::

## DNS Rebinding Defense

DNS rebinding is a classic technique for bypassing SSRF checks. The attacker controls the domain's DNS server so that the first resolution returns a public IP (passing validation) while the actual connection resolves to `127.0.0.1` (bypassing validation).

HTTPC uses a "resolve - validate - dial-directly" pattern to defend against this:

1. **Resolve**: resolve the domain to a list of IPs
2. **Validate**: check each IP against the private/reserved list
3. **Filter**: remove blocked IPs, keeping only allowed ones (`FilterAllowedIPs`)
4. **Dial directly**: dial the validated IP directly, without re-resolving the domain

```go
// Attack scenario:
// 1. Attacker controls DNS for evil.com
// 2. Validation-time resolution returns a public IP (passes validation)
// 3. Standard net/http would re-resolve the domain (now returning 127.0.0.1, bypassing validation)
//
// HTTPC defense: at dial time it uses the already-validated IP directly, never re-resolving the domain
```

:::tip
Under "Split-Horizon DNS" (where the same domain resolves to both public and private IPs), HTTPC's `FilterAllowedIPs` automatically filters out private IPs and connects using only public IPs, rather than rejecting the entire domain.
:::

## SSRFExemptCIDRs Precise Exemption

In microservice environments you often need to reach services inside a VPC, Kubernetes Service, or VPN. `SSRFExemptCIDRs` lets you precisely exempt specific CIDR ranges while keeping all other private IPs blocked — this is the recommended way to access internal services.

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",       // VPC internal
    "100.64.0.0/10",    // Tailscale VPN
    "172.20.0.0/16",    // Kubernetes Service CIDR
}
client, _ := httpc.New(cfg)
```

### Typical Exemption Use Cases

| Scenario | CIDR | Description |
|------|------|------|
| VPC internal services | `10.0.0.0/8` | AWS/GCP/Azure default VPC |
| Tailscale VPN | `100.64.0.0/10` | Tailscale range (RFC 6598) |
| Kubernetes | `172.20.0.0/16`, etc. | Pod/Service CIDR |
| WireGuard | `10.13.0.0/16`, etc. | Custom VPN range |

An invalid CIDR causes `httpc.New()` to return an error (e.g. `SSRFExemptCIDRs: invalid CIDR "10.0.0/8"`), failing the configuration at startup rather than silently passing at runtime.

:::warning
Exempted CIDRs should be as precise as possible. Avoid overly broad ranges (e.g. `0.0.0.0/0`), which amount to disabling SSRF protection entirely. Even `10.0.0.0/8` should be evaluated for whether it can be narrowed to the actually used subnet.
:::

## AllowPrivateIPs vs SSRFExemptCIDRs Comparison

Both can permit internal services, but their security semantics are very different:

| Dimension | `AllowPrivateIPs = true` | `SSRFExemptCIDRs` |
|------|--------------------------|--------------------|
| Protection state | **Completely bypasses** SSRF validation | Only exempts the listed CIDRs; the rest stay blocked |
| Coverage | All private/reserved/loopback/link-local IPs | Only the listed CIDRs |
| localhost | Allowed | Still blocked by default (unless `127.0.0.0/8` is explicitly exempted) |
| Cloud metadata | **Reachable** (dangerous) | Still blocked by default |
| Risk level | High — attack surface equals disabling SSRF | Low — precise allowance |
| Recommendation | Testing / all-internal clients only | Recommended for production |

:::danger
`AllowPrivateIPs = true` completely bypasses dialer-level SSRF validation (not just "allowing private IPs"), including localhost checks, link-local checks, and all reserved-address checks. Never use it in production when handling any untrusted URL. To reach internal services, prefer `SSRFExemptCIDRs`.
:::

## Per-Request Private-IP Exemption

If the client as a whole uses secure defaults (`AllowPrivateIPs = false`) and only individual requests need internal access (e.g. a `localhost` health-check endpoint), use the `WithAllowPrivateIPs` request option to allow it per request, without globally relaxing security:

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	// Default client blocks private IPs; this call allows it per request
	result, err := httpc.Get("http://localhost:8080/health",
		httpc.WithAllowPrivateIPs(true),
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("health-check status: %d\n", result.StatusCode())
}
```

:::warning
Enable `WithAllowPrivateIPs(true)` only for **trusted URLs that do not come from user input**. The purpose of SSRF protection is to stop attackers from tricking your process into reaching internal-network endpoints; disabling it per request reintroduces that risk for that call. If an entire client needs to reach internal services, set `Security.AllowPrivateIPs = true` on `Config`.
:::

The reverse usage works too: if the client is configured with `AllowPrivateIPs = true` (e.g. an all-internal client) but a single request needs SSRF checking forced on, use `WithAllowPrivateIPs(false)`.

## SSRF Checks During Redirects

Redirects are a major SSRF vector: a public service may 302 to `http://169.254.169.254/` (cloud metadata) or an internal address. HTTPC performs SSRF IP validation on redirect targets too.

| Client configuration | Behavior when redirecting to a private IP |
|-----------|----------------------|
| `AllowPrivateIPs = false` (default) | Blocked — redirect-target IP validation fails |
| `AllowPrivateIPs = true` | Allowed — SSRF bypassed (including redirects) |
| `WithAllowPrivateIPs(true)` per request | That request's redirect to a private IP is allowed |
| `SSRFExemptCIDRs` match | Redirect to the exempted CIDR is allowed |

```go
// Scenario: request public-api.com, server 302 redirects to http://169.254.169.254/
// HTTPC validates the redirect target's IP, blocking access to the cloud-metadata service
```

### Redirect Domain Whitelist

`RedirectWhitelist` adds domain-level control on top of IP validation, preventing open-redirect vulnerabilities:

```go
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "auth.example.com",
    "*.cdn.example.com", // Wildcard: matches strict subdomains
}
// Redirects to non-whitelisted domains are blocked
```

The wildcard `*.example.com` matches `api.example.com`, `static.cdn.example.com`, and other strict subdomains, but **does not match** the bare domain `example.com` (which must be listed separately). `IsAllowed` returns `true` (allow all) when the whitelist is `nil`.

## Configuration Examples

### Secure Configuration (Handling User URLs)

When handling user-provided URLs, use `SecureConfig()` for the strictest SSRF protection:

```go
cfg := httpc.SecureConfig()
// AllowPrivateIPs = false (strict SSRF)
// FollowRedirects = false (blocks redirect SSRF)
// MaxResponseBodySize = 5MB
client, _ := httpc.New(cfg)
```

### Internal Service Configuration (Accessing a VPC)

To access VPC/Kubernetes internal services, use `SSRFExemptCIDRs` to allow precisely:

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",     // VPC
    "172.20.0.0/16",  // Kubernetes Service
}
client, _ := httpc.New(cfg)
```

### Hybrid Configuration (Public + Internal)

When the same client needs to reach both public APIs and internal services, and the internal service subnet is known:

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.50.0.0/16",   // Internal-service dedicated subnet (precise)
}
cfg.Security.RedirectWhitelist = []string{
    "api.public.com",
    "*.internal.corp", // Only allow redirects to trusted internal domains
}
client, _ := httpc.New(cfg)
```

## Completely Disabling SSRF Protection

Use only in test environments. Two ways:

```go
// Method 1: TestingConfig (also disables TLS verification and other security features)
client, _ := httpc.New(httpc.TestingConfig())

// Method 2: manual configuration
cfg := httpc.DefaultConfig()
cfg.Security.AllowPrivateIPs = true
client, _ := httpc.New(cfg)
```

`TestingConfig()` prints a security warning to `stderr` in non-test environments (see [Security Overview](./)).

:::danger
Never set `AllowPrivateIPs = true` in production. This amounts to completely abandoning SSRF protection — an attacker can use it to reach cloud metadata, internal services, and admin interfaces.
:::

## Best Practices

1. Use `SecureConfig()` as the security baseline for handling untrusted URLs
2. Use only `SSRFExemptCIDRs` to precisely exempt necessary CIDR ranges; avoid `AllowPrivateIPs`
3. Configure `RedirectWhitelist` to limit redirect destination domains
4. Disable redirects (`FollowRedirects = false`) when handling user URLs
5. Periodically audit the `SSRFExemptCIDRs` configuration and remove unused subnets
6. Use `AuditMiddleware` to record all requests for post-incident tracing of SSRF attempts

## Next Steps

- [TLS and Certificate Pinning](./tls-certpin) - TLS security configuration and certificate pinning
- [Security Overview](./) - Security features overview
- [Production Checklist](./production-checklist) - Pre-launch SSRF checks
