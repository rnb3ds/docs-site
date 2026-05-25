---
title: "TLS and Certificate Pinning - HTTPC"
description: "HTTPC TLS and certificate pinning guide: TLS 1.2-1.3 version control and cipher suites, custom CA certificate loading, mTLS mutual authentication, VerifyPeerCertificate SPKI public key pinning strategy, InsecureSkipVerify warning, and HTTP/2 negotiation."
---

# TLS and Certificate Pinning

## TLS Version Control

HTTPC requires TLS 1.2+ by default, recommending TLS 1.3:

```go
cfg := httpc.DefaultConfig()
cfg.Security.MinTLSVersion = tls.VersionTLS12  // Default
cfg.Security.MaxTLSVersion = tls.VersionTLS13  // Default
```

### Version Details

| Version | Status | HTTPC Default |
|---------|--------|---------------|
| TLS 1.0 | Insecure, deprecated | Rejected |
| TLS 1.1 | Insecure, deprecated | Rejected |
| TLS 1.2 | Secure | Minimum requirement |
| TLS 1.3 | Most secure, recommended | Supported |

## Cipher Suites

The default configuration only allows secure cipher suites:

| Cipher Suite | Description |
|-------------|-------------|
| `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256` | Recommended |
| `TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384` | Recommended |
| `TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305` | Recommended |
| `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` | Recommended |
| `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` | Recommended |
| `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305` | Recommended |

## Custom TLS Configuration

```go
cfg := httpc.DefaultConfig()
cfg.Security.TLSConfig = &tls.Config{
    MinVersion: tls.VersionTLS13,  // Force TLS 1.3
    // Other custom settings
}
```

### Custom CA Certificate

```go
caCert, _ := os.ReadFile("custom-ca.pem")
caCertPool := x509.NewCertPool()
caCertPool.AppendCertsFromPEM(caCert)

cfg := httpc.DefaultConfig()
cfg.Security.TLSConfig = &tls.Config{
    RootCAs:    caCertPool,
    MinVersion: tls.VersionTLS12,
}

client, _ := httpc.New(cfg)
```

### Mutual TLS (mTLS)

```go
cert, _ := tls.LoadX509KeyPair("client-cert.pem", "client-key.pem")

cfg := httpc.DefaultConfig()
cfg.Security.TLSConfig = &tls.Config{
    Certificates: []tls.Certificate{cert},
    MinVersion:   tls.VersionTLS12,
}

client, _ := httpc.New(cfg)
```

## Certificate Pinning

Certificate pinning prevents man-in-the-middle attacks by verifying the public key hash of the server certificate.

### SPKI Hash Pinning

The most common pinning method, verifying the SPKI hash of any certificate in the chain:

```go
// Generate SPKI hash:
// openssl x509 -in cert.pem -pubkey -noout | \
//   openssl pkey -pubin -outform der | \
//   openssl dgst -sha256 -binary | \
//   openssl enc -base64

// Pin Let's Encrypt intermediate certificate
cfg := httpc.DefaultConfig()
cfg.Security.TLSConfig = &tls.Config{
    InsecureSkipVerify: true, // Fully replaces standard validation, must perform all checks in VerifyPeerCertificate
    VerifyPeerCertificate: func(rawCerts [][]byte, verifiedChains [][]*x509.Certificate) error {
        // Implement certificate pinning logic here
        // Note: With InsecureSkipVerify=true, standard chain validation is skipped; complete certificate validation must be done here
        return nil
    },
}
```

:::warning
Certificate pinning increases maintenance costs. If the server changes certificates (e.g., Let's Encrypt renewal), the client needs to update pinned values accordingly.
It is recommended to pin multiple certificates simultaneously (e.g., leaf certificate + intermediate certificate) and set up an update mechanism.
:::

### Pinning Strategies

| Strategy | Security | Maintenance Cost | Recommendation |
|----------|----------|------------------|----------------|
| Pin root certificate | Low | Low | Tamper protection only |
| Pin intermediate certificate | Medium | Medium | Recommended |
| Pin leaf certificate | High | High | High-security scenarios |
| Pin multiple levels | High | Medium | Best |

## InsecureSkipVerify

```go
// For testing only!
cfg := httpc.TestingConfig()
// InsecureSkipVerify = true -> Skips TLS certificate verification
```

:::danger
`InsecureSkipVerify = true` disables all TLS security measures. Use only in testing environments. Never set to `true` in production.
:::

## HTTP/2

HTTP/2 is enabled by default and only available with TLS:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // Disable HTTP/2
```

## Best Practices

1. Use the default TLS configuration (TLS 1.2+)
2. When pinning certificates, pin the intermediate certificate and prepare backup pins
3. Regularly update pinned values in sync with server certificate renewals
4. Use `SecureConfig()` as a security baseline
5. Never set `InsecureSkipVerify` in production

## Next Steps

- [SSRF Protection](./ssrf) - SSRF security configuration
- [Security Overview](./) - Security features overview
- [Configuration API](../api-reference/config) - SecurityConfig reference
