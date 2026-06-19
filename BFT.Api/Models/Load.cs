namespace BFT.Api.Models;

public enum LoadStatus { Pending, Assigned, InTransit, AtCheckpoint, Delivered, Cancelled }

public class Load
{
    public Guid       Id          { get; set; }
    public Guid       TenantId    { get; set; }
    public string     Origin      { get; set; } = string.Empty;
    public string     Destination { get; set; } = string.Empty;
    public decimal    WeightLbs   { get; set; }
    public decimal    Miles       { get; set; }
    public LoadStatus Status      { get; set; } = LoadStatus.Pending;
    public Guid?      DriverId    { get; set; }
    public Driver?    Driver      { get; set; }
    public DateTimeOffset? Eta    { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
