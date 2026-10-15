import {
  createAvailabilityException,
  createAvailabilityRule,
  type Appointment,
  type AvailabilityException,
  type AvailabilityExceptionSearchCriteria,
  type AvailabilityResourceType,
  type AvailabilityRule,
  type AvailabilityRuleSearchCriteria,
  type AvailabilitySlot,
  type AvailabilitySlotRequest,
  type AvailabilitySlotResult
} from "@intrusionshield/his";

import type {
  AppointmentRepository
} from "../infrastructure/repositories/AppointmentRepository.js";

import type {
  AvailabilityRepository
} from "../infrastructure/repositories/AvailabilityRepository.js";

interface Interval {
  start: Date;
  end: Date;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

const datePattern =
  /^\d{4}-\d{2}-\d{2}$/;

const minuteMs = 60_000;

export class AvailabilityService {
  public constructor(
    private readonly repository:
      AvailabilityRepository,

    private readonly appointmentRepository:
      AppointmentRepository
  ) {}

  public async listRules(
    criteria: AvailabilityRuleSearchCriteria
  ): Promise<AvailabilityRule[]> {
    return this.repository.listRules(
      criteria
    );
  }

  public async getRule(
    id: string,
    tenantId: string
  ): Promise<AvailabilityRule | null> {
    return this.repository.findRuleById(
      id,
      tenantId
    );
  }

  public async createRule(
    rule: AvailabilityRule
  ): Promise<AvailabilityRule> {
    return this.repository.createRule(
      createAvailabilityRule(rule)
    );
  }

  public async updateRule(
    rule: AvailabilityRule
  ): Promise<AvailabilityRule> {
    return this.repository.updateRule(
      createAvailabilityRule(rule)
    );
  }

  public async listExceptions(
    criteria:
      AvailabilityExceptionSearchCriteria
  ): Promise<AvailabilityException[]> {
    return this.repository.listExceptions(
      criteria
    );
  }

  public async getException(
    id: string,
    tenantId: string
  ): Promise<AvailabilityException | null> {
    return this.repository.findExceptionById(
      id,
      tenantId
    );
  }

  public async createException(
    exception: AvailabilityException
  ): Promise<AvailabilityException> {
    return this.repository.createException(
      createAvailabilityException(
        exception
      )
    );
  }

  public async updateException(
    exception: AvailabilityException
  ): Promise<AvailabilityException> {
    return this.repository.updateException(
      createAvailabilityException(
        exception
      )
    );
  }

  public async getSlots(
    request: AvailabilitySlotRequest
  ): Promise<AvailabilitySlotResult> {
    this.assertSlotRequest(request);

    const resources: Array<{
      type: AvailabilityResourceType;
      id: string;
    }> = [];

    if (request.practitionerId) {
      resources.push({
        type: "PRACTITIONER",
        id: request.practitionerId
      });
    }

    if (request.clinicalLocationId) {
      resources.push({
        type: "CLINICAL_LOCATION",
        id: request.clinicalLocationId
      });
    }

    const rangeStart =
      this.localDateTimeToInstant(
        request.from,
        "00:00",
        request.timeZone
      );

    const rangeEnd =
      this.localDateTimeToInstant(
        this.addDays(request.to, 1),
        "00:00",
        request.timeZone
      );

    const windowsByResource:
      Interval[][] = [];

    for (const resource of resources) {
      const rules =
        await this.repository.listRules({
          tenantId: request.tenantId,
          resourceType: resource.type,
          resourceId: resource.id,
          active: true
        });

      const exceptions =
        await this.repository.listExceptions({
          tenantId: request.tenantId,
          resourceType: resource.type,
          resourceId: resource.id,
          from: rangeStart,
          to: rangeEnd
        });

      let windows =
        this.buildRuleWindows(
          rules,
          request.from,
          request.to,
          request.timeZone
        );

      const available =
        exceptions
          .filter(
            (item) =>
              item.exceptionType ===
              "AVAILABLE"
          )
          .map((item) => ({
            start: item.startsAt,
            end: item.endsAt
          }));

      windows =
        this.mergeIntervals([
          ...windows,
          ...available
        ]);

      const unavailable =
        exceptions
          .filter(
            (item) =>
              item.exceptionType ===
              "UNAVAILABLE"
          )
          .map((item) => ({
            start: item.startsAt,
            end: item.endsAt
          }));

      windows =
        this.subtractIntervals(
          windows,
          unavailable
        );

      windowsByResource.push(
        windows
      );
    }

    let candidateWindows =
      windowsByResource[0] ?? [];

    for (
      let index = 1;
      index < windowsByResource.length;
      index += 1
    ) {
      candidateWindows =
        this.intersectIntervals(
          candidateWindows,
          windowsByResource[index] ?? []
        );
    }

    const appointments =
      await this.loadAppointments(
        request,
        rangeStart,
        rangeEnd
      );

    const busy =
      appointments
        .filter(
          (item) =>
            item.status !== "CANCELLED" &&
            item.status !== "NO_SHOW"
        )
        .map((item) => ({
          start: item.scheduledStart,
          end: item.scheduledEnd
        }));

    candidateWindows =
      this.subtractIntervals(
        candidateWindows,
        busy
      );

    const slots =
      this.splitIntoSlots(
        candidateWindows,
        request.durationMinutes
      );

    return {
      from: request.from,
      to: request.to,
      durationMinutes:
        request.durationMinutes,
      timeZone: request.timeZone,
      practitionerId:
        request.practitionerId,
      clinicalLocationId:
        request.clinicalLocationId,
      slots
    };
  }

  private assertSlotRequest(
    request: AvailabilitySlotRequest
  ): void {
    if (!request.tenantId.trim()) {
      throw new Error(
        "tenantId is required"
      );
    }

    if (
      !request.practitionerId &&
      !request.clinicalLocationId
    ) {
      throw new Error(
        "practitionerId or clinicalLocationId is required"
      );
    }

    this.assertDateOnly(
      request.from,
      "from"
    );

    this.assertDateOnly(
      request.to,
      "to"
    );

    if (request.to < request.from) {
      throw new Error(
        "to cannot be before from"
      );
    }

    if (
      !Number.isInteger(
        request.durationMinutes
      ) ||
      request.durationMinutes < 1 ||
      request.durationMinutes > 1440
    ) {
      throw new Error(
        "durationMinutes must be a positive integer no greater than 1440"
      );
    }

    if (!request.timeZone.trim()) {
      throw new Error(
        "timeZone is required"
      );
    }

    try {
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: request.timeZone
        }
      ).format(new Date());
    }
    catch {
      throw new Error(
        "timeZone is invalid"
      );
    }
  }

  private assertDateOnly(
    value: string,
    name: string
  ): void {
    if (!datePattern.test(value)) {
      throw new Error(
        `${name} must use YYYY-MM-DD format`
      );
    }

    const parts =
      this.parseDate(value);

    const check =
      new Date(
        Date.UTC(
          parts.year,
          parts.month - 1,
          parts.day
        )
      );

    if (
      check.getUTCFullYear() !==
        parts.year ||
      check.getUTCMonth() !==
        parts.month - 1 ||
      check.getUTCDate() !==
        parts.day
    ) {
      throw new Error(
        `${name} is invalid`
      );
    }
  }

  private buildRuleWindows(
    rules: readonly AvailabilityRule[],
    from: string,
    to: string,
    timeZone: string
  ): Interval[] {
    const windows: Interval[] = [];

    for (
      let date = from;
      date <= to;
      date = this.addDays(date, 1)
    ) {
      const dayOfWeek =
        this.dayOfWeek(date);

      for (const rule of rules) {
        if (
          rule.dayOfWeek !== dayOfWeek ||
          rule.effectiveFrom > date ||
          (
            rule.effectiveTo !==
              undefined &&
            rule.effectiveTo < date
          )
        ) {
          continue;
        }

        const start =
          this.localDateTimeToInstant(
            date,
            rule.startTime,
            timeZone
          );

        const end =
          this.localDateTimeToInstant(
            date,
            rule.endTime,
            timeZone
          );

        if (
          end.getTime() >
          start.getTime()
        ) {
          windows.push({
            start,
            end
          });
        }
      }
    }

    return this.mergeIntervals(
      windows
    );
  }

  private async loadAppointments(
    request: AvailabilitySlotRequest,
    from: Date,
    to: Date
  ): Promise<Appointment[]> {
    const groups:
      Appointment[][] = [];

    if (request.practitionerId) {
      groups.push(
        await this.appointmentRepository.search({
          tenantId: request.tenantId,
          practitionerId:
            request.practitionerId,
          from,
          to
        })
      );
    }

    if (request.clinicalLocationId) {
      groups.push(
        await this.appointmentRepository.search({
          tenantId: request.tenantId,
          clinicalLocationId:
            request.clinicalLocationId,
          from,
          to
        })
      );
    }

    const byId =
      new Map<string, Appointment>();

    for (const group of groups) {
      for (const appointment of group) {
        byId.set(
          appointment.id,
          appointment
        );
      }
    }

    return [
      ...byId.values()
    ];
  }

  private mergeIntervals(
    input: readonly Interval[]
  ): Interval[] {
    if (input.length === 0) {
      return [];
    }

    const sorted =
      [...input].sort(
        (left, right) =>
          left.start.getTime() -
          right.start.getTime()
      );

    const merged: Interval[] = [];

    for (const interval of sorted) {
      const last =
        merged[merged.length - 1];

      if (
        !last ||
        interval.start.getTime() >
          last.end.getTime()
      ) {
        merged.push({
          start:
            new Date(
              interval.start.getTime()
            ),
          end:
            new Date(
              interval.end.getTime()
            )
        });

        continue;
      }

      if (
        interval.end.getTime() >
        last.end.getTime()
      ) {
        last.end =
          new Date(
            interval.end.getTime()
          );
      }
    }

    return merged;
  }

  private intersectIntervals(
    left: readonly Interval[],
    right: readonly Interval[]
  ): Interval[] {
    const result: Interval[] = [];

    let leftIndex = 0;
    let rightIndex = 0;

    while (
      leftIndex < left.length &&
      rightIndex < right.length
    ) {
      const a = left[leftIndex];
      const b = right[rightIndex];

      if (!a || !b) {
        break;
      }

      const start =
        new Date(
          Math.max(
            a.start.getTime(),
            b.start.getTime()
          )
        );

      const end =
        new Date(
          Math.min(
            a.end.getTime(),
            b.end.getTime()
          )
        );

      if (
        start.getTime() <
        end.getTime()
      ) {
        result.push({
          start,
          end
        });
      }

      if (
        a.end.getTime() <
        b.end.getTime()
      ) {
        leftIndex += 1;
      }
      else {
        rightIndex += 1;
      }
    }

    return result;
  }

  private subtractIntervals(
    source: readonly Interval[],
    exclusions: readonly Interval[]
  ): Interval[] {
    let result =
      this.mergeIntervals(source);

    const normalizedExclusions =
      this.mergeIntervals(exclusions);

    for (
      const exclusion of
      normalizedExclusions
    ) {
      const next: Interval[] = [];

      for (const interval of result) {
        if (
          exclusion.end.getTime() <=
            interval.start.getTime() ||
          exclusion.start.getTime() >=
            interval.end.getTime()
        ) {
          next.push(interval);
          continue;
        }

        if (
          exclusion.start.getTime() >
          interval.start.getTime()
        ) {
          next.push({
            start: interval.start,
            end:
              new Date(
                Math.min(
                  exclusion.start.getTime(),
                  interval.end.getTime()
                )
              )
          });
        }

        if (
          exclusion.end.getTime() <
          interval.end.getTime()
        ) {
          next.push({
            start:
              new Date(
                Math.max(
                  exclusion.end.getTime(),
                  interval.start.getTime()
                )
              ),
            end: interval.end
          });
        }
      }

      result = next;
    }

    return result;
  }

  private splitIntoSlots(
    windows: readonly Interval[],
    durationMinutes: number
  ): AvailabilitySlot[] {
    const duration =
      durationMinutes * minuteMs;

    const slots:
      AvailabilitySlot[] = [];

    for (const window of windows) {
      for (
        let start =
          window.start.getTime();
        start + duration <=
          window.end.getTime();
        start += duration
      ) {
        slots.push({
          start: new Date(start),
          end:
            new Date(
              start + duration
            )
        });
      }
    }

    return slots;
  }

  private parseDate(
    value: string
  ): LocalDateParts {
    const [
      year,
      month,
      day
    ] = value
      .split("-")
      .map(Number);

    return {
      year,
      month,
      day
    };
  }

  private dayOfWeek(
    value: string
  ): number {
    const parts =
      this.parseDate(value);

    return new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day
      )
    ).getUTCDay();
  }

  private addDays(
    value: string,
    days: number
  ): string {
    const parts =
      this.parseDate(value);

    const date =
      new Date(
        Date.UTC(
          parts.year,
          parts.month - 1,
          parts.day + days
        )
      );

    return [
      String(
        date.getUTCFullYear()
      ).padStart(4, "0"),
      String(
        date.getUTCMonth() + 1
      ).padStart(2, "0"),
      String(
        date.getUTCDate()
      ).padStart(2, "0")
    ].join("-");
  }

  private localDateTimeToInstant(
    date: string,
    time: string,
    timeZone: string
  ): Date {
    const dateParts =
      this.parseDate(date);

    const [
      hour,
      minute
    ] = time
      .split(":")
      .map(Number);

    const desiredUtc =
      Date.UTC(
        dateParts.year,
        dateParts.month - 1,
        dateParts.day,
        hour,
        minute,
        0,
        0
      );

    let candidate =
      desiredUtc;

    for (
      let iteration = 0;
      iteration < 4;
      iteration += 1
    ) {
      const actual =
        this.zonedParts(
          new Date(candidate),
          timeZone
        );

      const representedUtc =
        Date.UTC(
          actual.year,
          actual.month - 1,
          actual.day,
          actual.hour,
          actual.minute,
          0,
          0
        );

      const difference =
        desiredUtc -
        representedUtc;

      if (difference === 0) {
        return new Date(candidate);
      }

      candidate += difference;
    }

    const final =
      this.zonedParts(
        new Date(candidate),
        timeZone
      );

    if (
      final.year !== dateParts.year ||
      final.month !== dateParts.month ||
      final.day !== dateParts.day ||
      final.hour !== hour ||
      final.minute !== minute
    ) {
      throw new Error(
        `Local time ${date} ${time} does not exist in timeZone ${timeZone}`
      );
    }

    return new Date(candidate);
  }

  private zonedParts(
    instant: Date,
    timeZone: string
  ): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  } {
    const formatter =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone,
          hourCycle: "h23",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      );

    const parts =
      formatter.formatToParts(
        instant
      );

    const values =
      new Map<string, string>();

    for (const part of parts) {
      if (part.type !== "literal") {
        values.set(
          part.type,
          part.value
        );
      }
    }

    return {
      year:
        Number(values.get("year")),
      month:
        Number(values.get("month")),
      day:
        Number(values.get("day")),
      hour:
        Number(values.get("hour")),
      minute:
        Number(values.get("minute"))
    };
  }
}
