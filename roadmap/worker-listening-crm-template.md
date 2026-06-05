# Worker Listening CRM Template

## Purpose

This is a practical template for a private worker listening system.

It is inspired by the CRM pattern, but it is not a sales tool. It is a memory
tool for respectful rank-and-file conversations.

The purpose:

```text
listen
remember
follow up
find patterns
coordinate safely
```

This template is not legal advice, official union guidance, or a public
complaint system. Coordinate sensitive issues with the appropriate steward,
business representative, union officer, or qualified professional.

## Core Rule

Do not make people type while talking. Make the system easy to fill out after a
conversation in under two minutes.

Write less than you think.

Store only what is useful.

## Privacy Levels

Every record should have a privacy level.

### Private

Personal note only. Do not share.

Use for:

- Relationship notes
- Follow-up reminders
- Private uncertainty
- Context that could identify or expose someone

### Share With Union Contact

Can be summarized for a steward, rep, or trusted union contact.

Use for:

- Agreement questions
- Recurring workplace patterns
- Safety questions
- Specific incidents where the affected worker wants support

### Aggregate Only

Do not name people. Use only as a pattern.

Use for:

- "Several newer workers are confused about call times."
- "Multiple crew members asked about meal break expectations."
- "People want clearer training for audio networking."

### Public Resource

Safe to share publicly because it does not expose workers.

Use for:

- General training resources
- Meeting reminders
- Official links
- Public event information
- Contract education prompts that do not disclose issues

## Minimal Record

Use this when time is short:

```text
Name or nickname:
Venue / department:
Main concern:
What they want:
Follow-up date:
Privacy level:
```

If that is all you capture, it is enough.

## Full Record

```text
id:
createdAt:
updatedAt:

person:
  nameOrNickname:
  venue:
  department:
  crewType:
  relationshipStrength: new / familiar / trusted / close
  contactMethod: in person / phone / text / email / social / unknown

conversation:
  date:
  context: call / break / after work / meeting / phone / other
  mainConcern:
  exactWords:
  whatTheyWant:
  agreementQuestion:
  affectedGroup:

organizing:
  agreementKnowledge: low / medium / high / unknown
  willingToAttendMeeting: yes / no / maybe / unknown
  willingToHelpOthers: yes / no / maybe / unknown
  trustedByWorkers: yes / no / maybe / unknown
  trustedForTraining: yes / no / maybe / unknown
  needsSupport: yes / no / maybe / unknown

followUp:
  nextAction:
  followUpDate:
  whoToAsk:
  status: open / waiting / done / paused

privacy:
  level: private / share-with-union-contact / aggregate-only / public-resource
  consentToName: yes / no / unknown
  sensitive: yes / no

notes:
  privateNotes:
  patternNotes:
```

## Suggested Chips

### Relationship Strength

- New
- Familiar
- Trusted
- Close

### Venue / Department

- Audio
- Video
- Lighting
- Rigging
- Carpentry
- Projection
- General stagehand
- Convention
- Theater
- Arena
- Hotel
- Other

### Main Concern

- Scheduling
- Turnaround
- Safety
- Pay classification
- Meal breaks
- Training
- Dispatch or referral
- Communication
- Favoritism
- New worker support
- Equipment
- Contract question
- Other

### Agreement Knowledge

- Low
- Medium
- High
- Unknown

### Willingness

- Yes
- No
- Maybe
- Unknown

### Next Action

- Listen again
- Check agreement
- Ask steward
- Ask business rep
- Talk to experienced member
- Invite to meeting
- Send official link
- Summarize pattern
- No action

### Follow-Up Date

- Tomorrow
- 3 days
- 1 week
- 2 weeks
- 1 month
- Before next call
- Custom

## Conversation Prompts

Use one question at a time.

### Opening

```text
How has work been for you lately?
```

### Issue Discovery

```text
What is one thing you wish was better?
```

### Contract Awareness

```text
Do people know what the agreement says about that?
```

### Support

```text
Do people know who to talk to when something goes wrong?
```

### Communication

```text
Would better worker-to-worker communication help?
```

### Action

```text
What would be one realistic improvement?
```

## After-Conversation Summary

After talking, write this:

```text
What I heard:
What they want:
What I should check:
Who else might be affected:
Next respectful follow-up:
```

Keep it short.

## Pattern Tracker

Every week, summarize records without naming people:

```text
Top recurring issue:
Who seems affected:
What facts are confirmed:
What is still unclear:
What agreement section might apply:
Who should be asked:
One next step:
```

Example:

```text
Top recurring issue:
Newer audio workers feel underprepared for Dante/networking expectations.

Who seems affected:
Newer A/V workers and people crossing from general stagehand work into audio.

What facts are confirmed:
At least three workers asked for more training or clearer expectations.

What is still unclear:
Whether the current training path already covers this and people do not know
where to find it.

What agreement section might apply:
Unknown. Ask experienced member or rep.

Who should be asked:
Experienced audio lead, steward, or training contact.

One next step:
Draft a simple Dante/networking learning resource list.
```

## 30-Day Listening Log

### Week 1

Goal:

- Talk to five coworkers.
- Do not pitch.
- Capture only minimal records.

Checklist:

- Conversation 1
- Conversation 2
- Conversation 3
- Conversation 4
- Conversation 5

### Week 2

Goal:

- Identify top three recurring issues.

Output:

```text
Issue 1:
Issue 2:
Issue 3:
```

### Week 3

Goal:

- Ask a steward, rep, or experienced member how these issues fit the agreement
  or existing process.

Output:

```text
Question asked:
Who answered:
What I learned:
What not to assume:
Next step:
```

### Week 4

Goal:

- Bring two or three coworkers together around one concrete improvement.

Output:

```text
Issue:
Who is affected:
What improvement is realistic:
Who should be included:
What is the next collective step:
```

## Future App Data Model

If this becomes a portal app, records should be private by default.

### Local Draft Record

```js
{
  id: 'worker_listening_...',
  app: 'worker-listening-crm',
  version: 1,
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
  person: {
    nameOrNickname: '',
    venue: '',
    department: '',
    crewType: '',
    relationshipStrength: 'new',
    contactMethod: 'in-person'
  },
  conversation: {
    date: '2026-06-05',
    context: 'call',
    mainConcern: '',
    exactWords: '',
    whatTheyWant: '',
    agreementQuestion: '',
    affectedGroup: ''
  },
  organizing: {
    agreementKnowledge: 'unknown',
    willingToAttendMeeting: 'unknown',
    willingToHelpOthers: 'unknown',
    trustedByWorkers: 'unknown',
    trustedForTraining: 'unknown',
    needsSupport: 'unknown'
  },
  followUp: {
    nextAction: 'listen-again',
    followUpDate: '',
    whoToAsk: '',
    status: 'open'
  },
  privacy: {
    level: 'private',
    consentToName: 'unknown',
    sensitive: false
  },
  notes: {
    privateNotes: '',
    patternNotes: ''
  }
}
```

### Storage Recommendation

Do not write this record to a public Gun path.

Private encrypted sync concept:

```text
~{userPub}/worker-power/v1/listeningRecords/{recordId}
```

Safe public template/resource concept:

```text
3dvr-portal/worker-power/templates/{templateId}
3dvr-portal/worker-power/publicResources/{resourceId}
```

## What Not To Store

Avoid storing:

- Social Security numbers
- Home addresses
- Private medical information
- Immigration status
- Private personnel details
- Rumors stated as facts
- Coworker names without consent
- Client-sensitive or event-sensitive information
- Anything that would create unnecessary retaliation risk

If a detail is not needed for a next respectful action, do not store it.

## Export Template

Use this when bringing a question to a steward, rep, or experienced member:

```text
Issue pattern:
Who is affected, without unnecessary names:
Dates or examples:
Agreement section if known:
What workers want clarified:
What has already been tried:
What I am asking for:
```

## Design North Star

The Worker Listening CRM should make it easier to be:

```text
calm
useful
trusted
organized
contract-aware
privacy-aware
collective
```

The highest-status behavior is not being the loudest person.

It is being the coworker who remembers, follows up, checks facts, and brings
people together safely.

