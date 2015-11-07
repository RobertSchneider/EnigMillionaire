# EnigMillionaire
==
## Sample SMP
|Alice              |<->  |Bob                |
|-------------------|:----|:------------------|
|a2  = rand()       |     |b2  = rand()       |
|a3  = rand()       |     |b3  = rand()       |
|g2a = g1^a2        |     |                   |
|g3a = g1^a3        |     |                   |
|g2a, g3a           | ->  |g2a, g3a           |
|                   |     |g2b = g1^b2        |
|				            |     |g3b = g1^b3        |
|			      	      |     |g2  = g2a^b2       |
|			      	      |     |g3  = g3a^b3       |
|			      	      |     |r   = rand()       |
|			      	      |     |Pb  = g3^r         |
|			              |     |Qb  = g1^r * g2^y  |
|g2b, g3b, Pb, Qb   | <-  |g2b, g3b, Pb, Qb   |
|g2  = g2b^a2       |     |                   |
|g3  = g3b^a3       |     |                   |
|s   = rand()       |     |                   |
|Pa  = g3^s         |     |                   |
|Qa  = g1^s * g2^x  |     |                   |
|Ra  = (Qa / Qb)^a3 |     |                   |
|Pa, Qa, Ra         | ->  |Pa, Qa, Ra         |
|                   |     |Rb  = (Qa / Qb)^b3 |
|                   |     |Rab = Ra^b3        |
|                   |     |Rab == (Pa / Pb)   |
|Rb                 | <-  |Rb                 |
|Rab = Rb^a3        |     |                   |
|Rab == (Pa / Pb)   |     |                   |

##First protocol idea
-----BEGIN MILL MESSAGE-----
Version: 1.0
Staus: 1
Data:
g2a = 1
g3a = 5

-----END MILL MESSAGE-----
