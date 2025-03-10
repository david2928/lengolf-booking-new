# Debugging Guide

This document provides information about debugging features in the application.

## Customer Matching Debug Options

### Phone Number Comparison Logging

The customer matching system uses phone number comparison to match users with their CRM records. By default, all logging of phone number comparisons is disabled to reduce console noise.

To enable phone number comparison logging:

1. Set the `DEBUG_PHONE_COMPARISON` environment variable to `true` in your `.env.local` file:

```
DEBUG_PHONE_COMPARISON=true
```

2. With this setting enabled, only *successful* phone matches (similarity > 0) will be logged, which helps to focus on potential matches while eliminating the vast majority of noise from non-matching numbers.

3. To disable logging again, set the variable to `false` or remove it entirely:

```
DEBUG_PHONE_COMPARISON=false
```

### Log Format

When enabled, phone comparison logs will appear in this format:

```
Phone comparison: '842695447' vs '842695447' - distance: 0, similarity: 1.00
Phone comparison: '842695447' vs '842695441' - distance: 1, similarity: 0.90
```

Where:
- The first number is the profile's phone number
- The second number is the potential CRM match's phone number
- Distance is the Levenshtein edit distance between the numbers
- Similarity is the calculated similarity score (0-1)

## Other Debugging Options

Additional debugging options may be added in the future and will be documented here. 