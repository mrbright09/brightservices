namespace BFT.Api.Models;

public enum CheckpointStatus { Pending, Passed, Failed, Bypassed }

public class WeightCheckpoint
{
    public Guid             Id           { get; set; }
    public Guid             LoadId       { get; set; }
    public Load?            Load         { get; set; }
    public string           ScaleStation { get; set; } = string.Empty;
    public CheckpointStatus Status       { get; set; } = CheckpointStatus.Pending;
    public DateTimeOffset?  CheckedAt    { get; set; }
}
