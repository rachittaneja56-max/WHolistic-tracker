from __future__ import annotations
from datetime import date, datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
FocusStatus = Literal["running", "paused", "completed", "cancelled"]
class FocusStartRequest(BaseModel):
 model_config=ConfigDict(extra="forbid"); entity_id: UUID; planned_minutes:int=Field(ge=1,le=720); source:str=Field(default="today",min_length=1,max_length=80); planned_session_id:UUID|None=None
class FocusTransitionRequest(BaseModel):
 model_config=ConfigDict(extra="forbid"); interruption_count:int|None=Field(default=None,ge=0,le=999)
class FocusReflectionRequest(BaseModel):
 model_config=ConfigDict(extra="forbid"); accomplished:str=Field(default="",max_length=10000); remaining:str=Field(default="",max_length=10000); learned:str=Field(default="",max_length=10000)
class FocusReflectionEntityRequest(BaseModel):
 model_config=ConfigDict(extra="forbid"); entity_type:Literal["til","note"]; title:str=Field(min_length=1,max_length=240); confirm:bool=False
class FocusSessionRead(BaseModel):
 id:UUID; entity_id:UUID; entity_title:str|None=None; entity_type:str|None=None; planned_minutes:int; actual_minutes:int; status:FocusStatus; started_at:datetime; paused_at:datetime|None=None; completed_at:datetime|None=None; cancelled_at:datetime|None=None; interruption_count:int=Field(ge=0); source:str; reflection:FocusReflectionRequest|None=None; reflection_entity_id:UUID|None=None
class StudyBlockInput(BaseModel):
 model_config=ConfigDict(extra="forbid"); entity_id:UUID; planned_minutes:int=Field(ge=1,le=720); start_at:datetime; source:str=Field(default="daily_plan",min_length=1,max_length=80)
class DailyPlanRequest(BaseModel):
 model_config=ConfigDict(extra="forbid"); day:date|None=None; available_minutes:int=Field(ge=0,le=1440); blocks:list[StudyBlockInput]=Field(default_factory=list,max_length=30)
class DailyPlanProposalRead(BaseModel):
 day:date; available_minutes:int; already_scheduled_minutes:int; remaining_minutes:int; workload_minutes:int; is_over_capacity:bool; blocks:list[StudyBlockInput]=Field(default_factory=list)
class StudyBlockRead(StudyBlockInput):
 id:UUID; status:Literal["planned","cancelled"]
class DailyPlanRead(DailyPlanProposalRead): blocks:list[StudyBlockRead]=Field(default_factory=list)