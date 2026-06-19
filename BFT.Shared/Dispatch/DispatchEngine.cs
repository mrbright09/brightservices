namespace BFT.Shared.Dispatch;

/// <summary>
/// Core driver assignment logic shared by BFT.Api (HTTP) and BFT.Desktop (WinForms).
/// No infrastructure dependencies — pure domain logic.
/// </summary>
public class DispatchEngine
{
    public DriverAssignmentResult AssignDriver(
        string loadId,
        IEnumerable<AvailableDriver> drivers)
    {
        var best = drivers
            .Where(d => d.IsAvailable)
            .OrderByDescending(d => d.Rating)
            .ThenBy(d => d.CurrentJobCount)
            .FirstOrDefault();

        return best is null
            ? new DriverAssignmentResult { Success = false, Reason = "No available drivers." }
            : new DriverAssignmentResult { Success = true, DriverId = best.Id };
    }
}

public record AvailableDriver(string Id, bool IsAvailable, decimal Rating, int CurrentJobCount);

public class DriverAssignmentResult
{
    public bool    Success  { get; init; }
    public string? DriverId { get; init; }
    public string? Reason   { get; init; }
}
