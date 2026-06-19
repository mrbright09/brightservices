namespace BFT.Shared.WeightCheckpoints;

/// <summary>
/// Federal bridge law weight validation.
/// Used by BFT.Api for API-side enforcement and BFT.Desktop for offline air-gapped checks.
/// </summary>
public class CheckpointValidator
{
    // Federal limits (lbs) per FHWA bridge formula
    private const decimal SingleAxleLimit    = 20_000m;
    private const decimal TandemAxleLimit    = 34_000m;
    private const decimal GrossVehicleLimit  = 80_000m;

    public CheckpointResult Validate(decimal grossWeightLbs, int axleCount)
    {
        if (grossWeightLbs > GrossVehicleLimit)
            return CheckpointResult.Fail;

        if (axleCount > 0)
        {
            var perAxle = grossWeightLbs / axleCount;
            var limit   = axleCount >= 2 ? TandemAxleLimit : SingleAxleLimit;
            if (perAxle > limit)
                return CheckpointResult.RequiresInspection;
        }

        return CheckpointResult.Pass;
    }
}

public enum CheckpointResult { Pass, Fail, RequiresInspection }
