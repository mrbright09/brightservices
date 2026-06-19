namespace BFT.Api.Models;

public enum TenantTier { Core, Pro, Enterprise }

public class Tenant
{
    public Guid       Id               { get; set; }
    public string     Name             { get; set; } = string.Empty;
    public TenantTier Tier             { get; set; } = TenantTier.Core;
    public string?    StripeCustomerId { get; set; }
    public DateTimeOffset CreatedAt    { get; set; } = DateTimeOffset.UtcNow;
}
