namespace BFT.Api.Models;

public enum DriverStatus { Available, OnDuty, OffDuty }

public class Driver
{
    public Guid         Id       { get; set; }
    public Guid         TenantId { get; set; }
    public string       Name     { get; set; } = string.Empty;
    public string       Vehicle  { get; set; } = string.Empty;
    public DriverStatus Status   { get; set; } = DriverStatus.Available;
    public decimal      Rating   { get; set; } = 5.0m;
}
